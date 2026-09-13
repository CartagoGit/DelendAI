#!/usr/bin/env bun

/**
 * forge:publish — the one supported way an agent turns work in the
 * shared checkout into a candidate.
 *
 * WHY this is a command and not a hook. The obvious place for a
 * pre-flight is `pre-push`, and that is where it was first put. It does
 * not work: under the shared-checkout model a candidate is published by
 * pushing a `commit-tree` object while the checkout sits on an unchanged
 * integration branch, lefthook computes an empty file set for that push,
 * and skips the whole hook —
 *
 *     drift-check (skip) no matching push files
 *     no-secrets-push (skip) no matching push files
 *     publication-proof (skip) no matching push files
 *
 * — then prints a green summary. Reproduced with `git push --dry-run`.
 * lefthook v2 offers no option that turns it off. So the gate lives
 * where the publication itself lives, and consults no file set it can be
 * fooled about. The hook stays as a backstop for ordinary pushes.
 *
 * WHY plumbing and not a branch. `checkout -b`, commit, push, `checkout
 * develop` moves the shared working tree four times. With one agent that
 * is merely rude; with fifteen it is how one agent's publication eats
 * another's uncommitted edit. A throwaway index and `commit-tree` touch
 * neither HEAD, the index, nor the working tree — the checkout does not
 * know a publication happened.
 *
 * WHY the tree is seeded from the integration branch and not from the
 * ref's own tip: that is what makes a re-publish a refresh. The
 * candidate is always "the integration branch, plus these paths", so it
 * can never silently carry a stale copy of a file somebody else has
 * since changed.
 *
 * Usage:
 *   bun run forge:publish -- --ref=delendai/pr/<slug> --message="..."
 *   bun run forge:publish -- --ref=... --message=... --path=a --path=b
 *   bun run forge:publish -- --ref=... --message=... --dry-run
 *
 * With no `--path`, every path that differs from the integration branch
 * is published. That is the common case and the one worth making easy.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { scopeViolations } from '../lint/publication-scope.script';
import { PROOF_STEPS } from '../lint/publication-proof-gate.script';
import { repoRoot } from '../lib/monorepo-paths';
import type {
	ICandidateContent,
	IPublicationOutcome,
} from './publish-candidate.interface';

export type {
	ICandidateContent,
	IPublicationOutcome,
} from './publish-candidate.interface';

const git = (args: readonly string[], env?: NodeJS.ProcessEnv): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		...(env === undefined ? {} : { env: { ...process.env, ...env } }),
	}).trim();

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

const args = (name: string): readonly string[] =>
	process.argv
		.filter((each) => each.startsWith(`--${name}=`))
		.map((each) => each.slice(name.length + 3));

/** The policy's own names, never a raw read of the config file. */
export const policyBranches = () => {
	const config = JSON.parse(
		readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	return resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	}).branches;
};

/**
 * Split the paths being published into what is written and what is
 * removed. Pure, so the split is testable without a working tree.
 *
 * A path that is absent from the checkout is only a DELETION when the
 * integration branch has it; otherwise it is a file that existed for a
 * moment and no longer does. That happens for real — the runtime writes
 * lock and mutex files while the pre-flight runs, and one of them was
 * picked up by `git status` and then reported as "1 removed" in a
 * publication that deleted nothing. Recording it as a deletion would
 * eventually ask the forge to remove a path that was never there, which
 * is the sort of instruction that reads as sabotage in a review.
 */
export const splitContent = (
	paths: readonly string[],
	exists: (path: string) => boolean,
	inIntegration: (path: string) => boolean = () => true,
): ICandidateContent => {
	const written = paths.filter((path) => exists(path));
	const absent = paths.filter((path) => !exists(path));
	return {
		written,
		removed: absent.filter((path) => inIntegration(path)),
		vanished: absent.filter((path) => !inIntegration(path)),
	};
};

/** Whether a ref may be published to at all, per the resolved policy. */
export const isPublicationRef = (ref: string, prefix: string): boolean =>
	prefix !== '' && ref.startsWith(prefix);

/**
 * Run the pre-flight and report EVERY failure, not the first. Stopping
 * early hands the author one problem, costs them another run to find the
 * next, and defeats the point of paying for the pass once.
 */
export const runPreflight = (
	run: (script: string) => number = (script) =>
		spawnSync('bun', ['run', script], {
			cwd: repoRoot(),
			stdio: 'inherit',
		}).status ?? 1,
	steps = PROOF_STEPS,
): readonly string[] => {
	const failed: string[] = [];
	for (const step of steps) {
		process.stdout.write(`forge:publish — ${step.script}\n`);
		if (run(step.script) !== 0) failed.push(step.script);
	}
	return failed;
};

const changedPaths = (integration: string): readonly string[] =>
	git(['status', '--porcelain'])
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => line.slice(3).trim())
		.filter((path) => path !== '')
		.concat(
			// A path the checkout no longer has but the integration
			// branch does is a deletion the candidate must carry.
			git(['diff', '--name-only', '--diff-filter=D', integration])
				.split('\n')
				.filter((line) => line.trim() !== ''),
		)
		.filter((path, index, all) => all.indexOf(path) === index);

const report = (outcome: IPublicationOutcome): string => {
	if (outcome.kind === 'published') {
		const { written, removed } = outcome.content;
		return [
			`✓ forge:publish — ${outcome.ref} at ${outcome.commit.slice(0, 9)}`,
			`  ${written.length} path(s) written, ${removed.length} removed`,
			'  the checkout did not move: no branch, no staging, no HEAD change.',
			'',
		].join('\n');
	}
	return [
		`✗ forge:publish refused — ${outcome.refusal.code}`,
		'',
		...outcome.refusal.detail.map((line) => `  ${line}`),
		'',
	].join('\n');
};

const main = (): number => {
	const branches = policyBranches();
	const ref = arg('ref');
	const message = arg('message');
	const dryRun = process.argv.includes('--dry-run');
	const integration = `origin/${branches.integration}`;

	if (ref === undefined || message === undefined) {
		process.stderr.write(
			'forge:publish needs --ref=<publication ref> and --message=<commit message>\n',
		);
		return 2;
	}
	if (!isPublicationRef(ref, branches.publicationRefPrefix)) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'NOT_A_PUBLICATION_REF',
					detail: [
						`\`${ref}\` is not under \`${branches.publicationRefPrefix}\`.`,
						'A candidate lives in the publication namespace so that every',
						'other tool can tell an artifact from somewhere to develop.',
					],
				},
			}),
		);
		return 1;
	}

	const paths =
		args('path').length > 0 ? args('path') : changedPaths(integration);
	if (paths.length === 0) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'NOTHING_TO_PUBLISH',
					detail: [
						'the checkout is identical to the integration branch.',
					],
				},
			}),
		);
		return 1;
	}

	const content = splitContent(
		paths,
		(path) => existsSync(join(repoRoot(), path)),
		(path) => {
			try {
				git(['cat-file', '-e', `${integration}:${path}`]);
				return true;
			} catch {
				return false;
			}
		},
	);
	if (content.vanished.length > 0) {
		process.stdout.write(
			`forge:publish — ignoring ${content.vanished.length} path(s) that no longer exist and never did on ${branches.integration}: ${content.vanished.join(', ')}\n`,
		);
	}

	const violations = scopeViolations(
		content.written.map((path) => ({
			path,
			content: readFileSync(join(repoRoot(), path), 'utf8').slice(0, 512),
		})),
	);
	if (violations.length > 0) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'SCOPE_VIOLATION',
					detail: violations.map((v) => `${v.path}: ${v.reason}`),
				},
			}),
		);
		return 1;
	}

	const failed = runPreflight();
	if (failed.length > 0) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'PREFLIGHT_FAILED',
					detail: [
						...failed.map((script) => `bun run ${script}`),
						'',
						'Pushing anyway costs a full CI matrix and a review to learn',
						'what these seconds already told you.',
					],
				},
			}),
		);
		return 1;
	}

	if (dryRun) {
		process.stdout.write(
			`forge:publish --dry-run: would publish ${paths.length} path(s) to ${ref}\n`,
		);
		return 0;
	}

	const index = join(
		mkdtempSync(join(tmpdir(), 'delendai-publish-')),
		'index',
	);
	try {
		const env = { GIT_INDEX_FILE: index };
		git(['read-tree', integration], env);
		for (const path of content.written) {
			const blob = git(['hash-object', '-w', path], env);
			git(
				[
					'update-index',
					'--add',
					'--cacheinfo',
					`100644,${blob},${path}`,
				],
				env,
			);
		}
		for (const path of content.removed) {
			git(['update-index', '--force-remove', path], env);
		}
		const tree = git(['write-tree'], env);
		const parents = [`origin/${ref}`, integration]
			.filter((candidate) => {
				try {
					git(['rev-parse', '--verify', `${candidate}^{commit}`]);
					return true;
				} catch {
					return false;
				}
			})
			.filter(
				// A brand-new ref has no tip, and a first publication has
				// only the integration branch as a parent.
				(candidate, position, all) =>
					all.indexOf(candidate) === position,
			);
		const commit = git([
			'commit-tree',
			tree,
			...parents.flatMap((parent) => ['-p', parent]),
			'-m',
			message,
		]);
		git(['push', 'origin', `${commit}:refs/heads/${ref}`]);
		process.stdout.write(
			report({ kind: 'published', ref, commit, content }),
		);
		return 0;
	} finally {
		rmSync(index, { force: true });
	}
};

if (import.meta.main) {
	process.exit(main());
}
