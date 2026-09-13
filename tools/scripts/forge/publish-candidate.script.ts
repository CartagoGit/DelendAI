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
 * WHY publishing everything is opt-in. The checkout is SHARED. While
 * this was being written the user opened
 * `packages/core/src/lib/development-policy/validate.ts` and edited it;
 * a publish that defaulted to "every path that differs from the
 * integration branch" would have carried that edit into an unrelated
 * candidate, under somebody else's authorship, with nothing in the
 * output saying so. With fifteen agents that is not a risk, it is a
 * certainty. So the wide form exists and has to be asked for by name,
 * and the refusal prints exactly what it would have taken.
 *
 * Usage:
 *   bun run forge:publish -- --ref=delendai/pr/<slug> --message="..." --path=a --path=b
 *   bun run forge:publish -- --ref=... --message=... --all
 *   bun run forge:publish -- --ref=... --message=... --all --dry-run
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from 'node:fs';
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

const gitRaw = (args: readonly string[], env?: NodeJS.ProcessEnv): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		...(env === undefined ? {} : { env: { ...process.env, ...env } }),
	});

/**
 * Trimmed output, for the commands whose answer is a single token. NOT
 * for `status --porcelain`, whose leading spaces carry meaning — see
 * `parseStatusPaths`.
 */
const git = (args: readonly string[], env?: NodeJS.ProcessEnv): string =>
	gitRaw(args, env).trim();

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
 * The git mode to record for a path.
 *
 * WHY this is not the constant `100644` it started as: that constant
 * silently demotes an executable script to a plain file, and turns a
 * symlink into a text file containing its target. Neither shows up in a
 * diff review — the content reads identically — and the first symptom is
 * a hook that no longer runs on somebody else's clone.
 *
 * The filesystem is asked first, because the checkout is what the author
 * actually wrote. The integration branch answers for a path git cannot
 * stat, and `100644` only when neither knows.
 */
export const modeOf = (
	path: string,
	integration: string,
	statMode: (target: string) => number | undefined = (target) => {
		try {
			return lstatSync(join(repoRoot(), target)).mode;
		} catch {
			return undefined;
		}
	},
	treeMode: (target: string) => string | undefined = (target) => {
		try {
			return git(['ls-tree', integration, '--', target]).split(/\s/u)[0];
		} catch {
			return undefined;
		}
	},
): string => {
	const mode = statMode(path);
	if (mode !== undefined) {
		if ((mode & 0o170000) === 0o120000) return '120000';
		if ((mode & 0o111) !== 0) return '100755';
		return '100644';
	}
	const fromTree = treeMode(path);
	return fromTree === undefined || fromTree === '' ? '100644' : fromTree;
};

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

/**
 * The paths in `git status --porcelain` output.
 *
 * WHY this is its own function with its own cases: the first version
 * trimmed the whole output before splitting it. A modified file's line
 * begins with a SPACE (` M path`), so trimming the buffer ate that space
 * on the first line only, `slice(3)` then removed a character of the
 * path, and the result was a path that exists nowhere. The publication
 * dropped it in silence — `.github/workflows/ci.yml` was missing from a
 * candidate whose whole point was editing `.github/workflows/ci.yml`,
 * and the summary said "13 written, 0 removed" as if nothing were
 * wrong. Losing exactly one file, always the alphabetically first, is
 * the kind of bug that survives for months.
 *
 * So: no trimming of the buffer, ever, and a rename reports the path it
 * became rather than the arrow syntax.
 */
export const parseStatusPaths = (raw: string): readonly string[] =>
	raw
		.split('\n')
		.filter((line) => line.length > 3)
		.map((line) => {
			const path = line.slice(3);
			const arrow = path.indexOf(' -> ');
			return arrow === -1 ? path : path.slice(arrow + 4);
		})
		.map((path) => path.replace(/^"|"$/gu, ''))
		.filter((path) => path !== '');

const changedPaths = (integration: string): readonly string[] =>
	parseStatusPaths(gitRaw(['status', '--porcelain']))
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

	const named = args('path');
	const everything = process.argv.includes('--all');
	if (named.length === 0 && !everything) {
		const would = changedPaths(integration);
		process.stderr.write(
			[
				'✗ forge:publish refused — say which paths are yours.',
				'',
				'  The checkout is shared. Publishing everything that differs',
				'  from the integration branch would carry whatever another',
				'  agent — or the user in their editor — happens to have open.',
				'',
				`  These ${would.length} path(s) differ right now:`,
				...would.map((path) => `    ${path}`),
				'',
				'next-action:',
				'  --path=<each one you changed>, or --all if every one of',
				'  those really is this candidate.',
				'',
			].join('\n'),
		);
		return 1;
	}
	const paths = named.length > 0 ? named : changedPaths(integration);
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
					`${modeOf(path, integration)},${blob},${path}`,
				],
				env,
			);
		}
		for (const path of content.removed) {
			git(['update-index', '--force-remove', path], env);
		}
		const tree = git(['write-tree'], env);
		// THE INVARIANT THAT WOULD HAVE CAUGHT #100. A candidate whose
		// tree equals the integration branch's tree changes nothing, and
		// a pull request for it can be merged — GitHub recorded #100 as
		// `merged: true, changed_files: 0, additions: 0, deletions: 0`
		// under a title and body describing a twenty-two file CI
		// redesign. The zones it promised are not on `develop`; the eight
		// shards it replaced still are.
		//
		// The cause was a shell one — zsh does not word-split an unquoted
		// `$PATHS`, so twenty-three paths arrived as ONE argument, and
		// `update-index --force-remove` on that non-path exits zero. No
		// command failed. The tree came out byte-identical to `develop`
		// and the push reported success.
		//
		// This check does not care what the cause was. Any publication
		// that would land nothing is refused, loudly, before the push —
		// because "the work is merged" has to mean the work is merged.
		if (tree === git(['rev-parse', `${integration}^{tree}`])) {
			process.stderr.write(
				report({
					kind: 'refused',
					refusal: {
						code: 'EMPTY_CANDIDATE',
						detail: [
							`the tree this would publish is identical to ${branches.integration}.`,
							`${String(content.written.length)} path(s) were meant to be written and ${String(content.removed.length)} removed,`,
							'and none of them changed anything. Nothing would land.',
							'',
							'This is the shape of the #100 incident: a candidate that',
							'merges green, reports success, and delivers nothing.',
						],
					},
				}),
			);
			return 1;
		}
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
