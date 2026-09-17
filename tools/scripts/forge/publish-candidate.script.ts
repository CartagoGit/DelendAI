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
 *   bun run forge:publish -- --ref=delendai/pr/<slug> --message="..." --from-work-branch=delendai/wip/<model>/<slice-topic> --open-pr
 *     (publishes the work branch's commit, then removes the work branch: only the publication ref remains)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { scopeViolations } from '../lint/publication-scope.script';
import { PROOF_STEPS } from '../lint/publication-proof-gate.script';
import type { IProofStep } from '../lint/publication-proof-gate.interface';
import { repoRoot } from '../lib/monorepo-paths';
import type {
	ICandidateContent,
	IPublicationOutcome,
	IPublicationRefusal,
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

/**
 * The repository's canonical worktree root.
 *
 * Hardcoded rather than imported from `plugins/proposals`: a `tools/`
 * script reaching into a plugin's internals is a layering inversion, and
 * `lint:worktree-location` already fails any worktree that is not here —
 * so the two cannot drift without something going red.
 */
export const worktreeRoot = (): string =>
	join(repoRoot(), '.cache', 'delendai', '.worktrees');

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
 * Prove a candidate COMMIT in a worktree of its own.
 *
 * WHY ISOLATION IS THE WHOLE POINT. The first version ran the checks in
 * the shared checkout, and that is not a proof of anything: the shared
 * tree contains every other agent's in-flight edits and the user's open
 * editor buffers. Measured on this repository — the gate failed a
 * candidate on `lint:solid` over a file that belonged to a completely
 * different piece of work sitting in the same tree, and it would just as
 * happily have PASSED a broken candidate that somebody else's uncommitted
 * fix was covering for. Both directions are wrong, and the second is the
 * dangerous one because nothing about it looks like a failure.
 *
 * So the tree under test is the candidate itself: the integration branch
 * plus exactly the paths this publication names, and nothing else in the
 * universe. What gets pushed afterwards is the very commit that was
 * proved — not a rebuild of it, not "the checkout as it was a moment
 * ago". `what I tested` and `what I push` are the same object id.
 *
 * WHY THIS IS AFFORDABLE, measured rather than assumed: `git worktree
 * add --detach` takes 1.2s and `bun install --frozen-lockfile` takes
 * 2.3s against the warm store. Four seconds to make a candidate's
 * verdict mean something is not a cost worth optimising away.
 *
 * The worktree lives under the repository's canonical worktree root and
 * is removed in a `finally`, so a thrown error cannot leak a directory.
 */
export const proveCommit = (
	commit: string,
	worktreeRoot: string,
	steps: readonly IProofStep[] = PROOF_STEPS,
	run: (script: string, cwd: string) => number = (script, cwd) =>
		spawnSync('bun', ['run', script], { cwd, stdio: 'inherit' }).status ??
		1,
): readonly string[] => {
	const dir = join(worktreeRoot, `preflight-${commit.slice(0, 12)}`);
	const failed: string[] = [];
	try {
		mkdirSync(worktreeRoot, { recursive: true });
		git(['worktree', 'add', '--detach', '-q', dir, commit]);
		// The candidate's OWN dependency tree. Symlinking the shared
		// `node_modules` would resolve every `@delendai/*` import back to
		// the shared checkout's sources, which is exactly the isolation
		// this function exists to have. Measured at 2.3s against the warm
		// store — cheaper than being wrong.
		//
		// `bun install`, not `bun run install`: the second looks for a
		// script by that name and there is none.
		const installed = spawnSync('bun', ['install', '--frozen-lockfile'], {
			cwd: dir,
			stdio: 'inherit',
		});
		if (installed.status !== 0) {
			return ['bun install --frozen-lockfile'];
		}
		for (const step of steps) {
			process.stdout.write(`forge:publish — ${step.script} (isolated)\n`);
			if (run(step.script, dir) !== 0) failed.push(step.script);
		}
		return failed;
	} finally {
		try {
			git(['worktree', 'remove', '--force', dir]);
		} catch {
			// Already gone, or never created. `prune` settles either.
		}
		git(['worktree', 'prune']);
	}
};

/**
 * Run the pre-flight and report EVERY failure, not the first. Stopping
 * early hands the author one problem, costs them another run to find the
 * next, and defeats the point of paying for the pass once.
 *
 * Kept for callers that deliberately want the CHECKOUT judged rather
 * than a candidate — `proveCommit` is what a publication uses.
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

/**
 * Paths this candidate would REVERT.
 *
 * The candidate tree is the integration branch with the claimed paths
 * overwritten from the working tree. That is only correct while the
 * working tree's idea of a path is at least as new as the integration
 * branch's. When a path moved on integration after this checkout's base
 * — because somebody else landed a change to it — overwriting it with
 * the checkout's copy silently undoes that landing, and every check
 * still passes because the resulting tree is perfectly coherent.
 *
 * That happened here: a checkout five commits behind published a
 * candidate carrying an older `validate.ts`, which would have removed a
 * rule merged in between. It was caught by hand. Explaining the rule
 * better does not prevent it; comparing the blobs does.
 *
 * Pure, and by object id rather than by content: two paths with equal
 * bytes have equal ids, so a path edited to match what landed upstream
 * is correctly NOT stale.
 */
export const stalePaths = (
	claimed: readonly string[],
	baseBlob: (path: string) => string | undefined,
	integrationBlob: (path: string) => string | undefined,
	workingBlob: (path: string) => string | undefined,
): readonly string[] =>
	claimed.filter((path) => {
		const upstream = integrationBlob(path);
		// Absent upstream: this candidate is adding it, so there is
		// nothing it could be reverting.
		if (upstream === undefined) return false;
		const base = baseBlob(path);
		// Unmoved since this checkout's base: the working copy descends
		// from what is on the branch.
		if (base === upstream) return false;
		// It moved upstream. Only an exact match with what landed proves
		// the working copy already carries it.
		return workingBlob(path) !== upstream;
	});

/**
 * The `gh` calls that turn a published ref into a pull request that will
 * merge itself once its checks pass.
 *
 * Publishing a ref and stopping was the gap another agent fell through:
 * a candidate on a ref nobody opened a pull request for is work that
 * looks delivered and never lands. `--open-pr` finishes the job, and
 * reuses an open pull request rather than opening a second one.
 */
/** Strip `refs/` and `heads/` so a qualified prefix matches a branch name. */
const shortRef = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * Decide whether a work branch can be published as a candidate, and
 * whether its remote copy is then deleted.
 *
 * The flow is: develop on a work branch, publish it, delete the work
 * branch — only the publication ref remains. Deleting is the default, and
 * refused only when the remote work branch holds commits the published
 * tip does not, because then deleting would lose work. Pure: the caller
 * reads git, this decides.
 */
export const planWorkBranchPublication = (input: {
	readonly workBranch: string;
	readonly workRefPrefix: string;
	readonly tipSha: string | undefined;
	readonly tipTree: string | undefined;
	readonly integrationTree: string;
	readonly remoteWorkSha: string | undefined;
	readonly remoteWorkContained: boolean;
}):
	| { readonly kind: 'refused'; readonly refusal: IPublicationRefusal }
	| { readonly kind: 'publish'; readonly deleteRemoteWork: boolean } => {
	const prefix = shortRef(input.workRefPrefix);
	if (prefix === '' || !input.workBranch.startsWith(prefix)) {
		return {
			kind: 'refused',
			refusal: {
				code: 'NOT_A_WORK_BRANCH',
				detail: [
					`\`${input.workBranch}\` is not under \`${prefix}\`.`,
					'Only a work branch is published and then removed.',
				],
			},
		};
	}
	if (input.tipSha === undefined || input.tipTree === undefined) {
		return {
			kind: 'refused',
			refusal: {
				code: 'UNKNOWN_WORK_BRANCH',
				detail: [
					`\`${input.workBranch}\` exists neither locally nor on the remote.`,
				],
			},
		};
	}
	if (input.tipTree === input.integrationTree) {
		return {
			kind: 'refused',
			refusal: {
				code: 'EMPTY_CANDIDATE',
				detail: [
					`\`${input.workBranch}\` has the same tree as the integration branch.`,
					'Nothing would land, so nothing is published or deleted.',
				],
			},
		};
	}
	if (input.remoteWorkSha !== undefined && !input.remoteWorkContained) {
		return {
			kind: 'refused',
			refusal: {
				code: 'WORK_BRANCH_AHEAD',
				detail: [
					`the remote \`${input.workBranch}\` has commits the local tip does not.`,
					'Publishing and then deleting it would lose them. Bring them in first.',
				],
			},
		};
	}
	return {
		kind: 'publish',
		deleteRemoteWork: input.remoteWorkSha !== undefined,
	};
};

export const pullRequestCommands = (input: {
	readonly ref: string;
	readonly base: string;
	readonly message: string;
}): {
	readonly find: readonly string[];
	readonly create: readonly string[];
	readonly arm: readonly string[];
} => {
	const [title = input.message, ...rest] = input.message.split('\n');
	const body = rest.join('\n').trim();
	return {
		find: [
			'pr',
			'list',
			'--head',
			input.ref,
			'--state',
			'open',
			'--json',
			'url',
			'--jq',
			'.[0].url // ""',
		],
		create: [
			'pr',
			'create',
			'--base',
			input.base,
			'--head',
			input.ref,
			'--title',
			title,
			'--body',
			body === '' ? title : body,
		],
		arm: ['pr', 'merge', input.ref, '--auto', '--merge'],
	};
};

const gh = (ghArgs: readonly string[]): string =>
	execFileSync('gh', [...ghArgs], {
		cwd: repoRoot(),
		encoding: 'utf8',
	}).trim();

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

	const workBranch = arg('from-work-branch');
	if (workBranch !== undefined) {
		return publishWorkBranch({
			ref,
			message,
			workBranch,
			dryRun,
			integration,
			branches,
		});
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

	// Refuse a candidate that would revert somebody else's landing. This
	// is the guard that makes a stale publication impossible rather than
	// merely discouraged: it compares object ids, so it cannot be talked
	// out of by an agent that misread the rule, and a path edited to
	// match what landed upstream is correctly not stale.
	const blobAt = (rev: string, path: string): string | undefined => {
		const id = gitRaw(['rev-parse', `${rev}:${path}`]).trim();
		return id.length === 0 ? undefined : id;
	};
	const stale = stalePaths(
		content.written,
		(path) => blobAt('HEAD', path),
		(path) => blobAt(integration, path),
		(path) => {
			const id = gitRaw(['hash-object', path]).trim();
			return id.length === 0 ? undefined : id;
		},
	);
	if (stale.length > 0) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'STALE_PATH',
					detail: stale.map(
						(path) =>
							`${path}: moved on ${integration} after this checkout's base, and the working copy does not carry that change. Publishing it would revert what landed. Advance the checkout, then republish.`,
					),
				},
			}),
		);
		return 1;
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
		// PROVE THE OBJECT, THEN PUSH THE OBJECT. The commit exists
		// locally and no remote has heard of it, so a failure here costs
		// nothing and leaks nothing. What the checks ran against and what
		// the forge receives are the same object id — there is no window
		// in which the checkout could change underneath the verdict.
		const failed = proveCommit(commit, worktreeRoot());
		if (failed.length > 0) {
			process.stderr.write(
				report({
					kind: 'refused',
					refusal: {
						code: 'PREFLIGHT_FAILED',
						detail: [
							`proved in isolation at ${commit.slice(0, 12)}; these failed:`,
							...failed.map((script) => `  bun run ${script}`),
							'',
							'Nothing was pushed. The candidate tree is the integration',
							'branch plus your paths and nothing else, so these are',
							'yours — no other agent’s work is in that tree.',
						],
					},
				}),
			);
			return 1;
		}

		if (dryRun) {
			process.stdout.write(
				`forge:publish --dry-run: ${String(paths.length)} path(s) proved at ${commit.slice(0, 12)}, not pushed.\n`,
			);
			return 0;
		}

		git(['push', 'origin', `${commit}:refs/heads/${ref}`]);
		process.stdout.write(
			report({ kind: 'published', ref, commit, content }),
		);
		if (!process.argv.includes('--open-pr')) return 0;
		return openPullRequest(ref, branches.integration, message);
	} finally {
		rmSync(index, { force: true });
	}
};

/**
 * Open (or find) the pull request for a published ref and arm auto-merge.
 * The ref is already published when this runs, so a failure says exactly
 * what is left rather than "failed".
 */
const openPullRequest = (
	ref: string,
	base: string,
	message: string,
): number => {
	const commands = pullRequestCommands({ ref, base, message });
	try {
		const existing = gh(commands.find);
		const url = existing !== '' ? existing : gh(commands.create);
		gh(commands.arm);
		process.stdout.write(
			`✓ forge:publish — ${url} ${existing !== '' ? 'already open' : 'opened'}, auto-merge armed.\n`,
		);
		return 0;
	} catch (error) {
		process.stderr.write(
			[
				`✗ forge:publish — ${ref} was pushed, and the pull request step did not finish.`,
				'',
				`  ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
				'',
				'next-action:',
				`  gh ${commands.create.join(' ')}`,
				`  gh ${commands.arm.join(' ')}`,
				'',
			].join('\n'),
		);
		return 1;
	}
};

/** `git rev-parse --verify` that answers undefined instead of throwing. */
const revOrUndefined = (rev: string): string | undefined => {
	try {
		return git(['rev-parse', '--verify', '--quiet', rev]);
	} catch {
		return undefined;
	}
};

/**
 * `--from-work-branch`: publish a work branch as a candidate, then remove
 * the work branch. Only the publication ref remains — the remote work
 * branch, and locally its worktree and branch when that worktree is clean.
 * Every deletion happens after the forge confirms the publication ref is
 * at the published commit, never before.
 */
const publishWorkBranch = (input: {
	readonly ref: string;
	readonly message: string;
	readonly workBranch: string;
	readonly dryRun: boolean;
	readonly integration: string;
	readonly branches: ReturnType<typeof policyBranches>;
}): number => {
	const { ref, workBranch, integration } = input;
	// Read the remote tip without rewriting any local ref, then make sure the
	// object is present for the ancestry check. No forced refspec anywhere
	// on this path: losing a race must fail loudly, not overwrite.
	const remoteLine = gitRaw([
		'ls-remote',
		'origin',
		`refs/heads/${workBranch}`,
	]).trim();
	const remoteWorkSha =
		remoteLine === '' ? undefined : remoteLine.split(/\s+/u)[0];
	if (remoteWorkSha !== undefined) {
		git(['fetch', '-q', 'origin', `refs/heads/${workBranch}`]);
	}
	const localSha = revOrUndefined(`refs/heads/${workBranch}^{commit}`);
	const tipSha = localSha ?? remoteWorkSha;
	let remoteWorkContained = true;
	if (remoteWorkSha !== undefined && tipSha !== undefined) {
		try {
			git(['merge-base', '--is-ancestor', remoteWorkSha, tipSha]);
		} catch {
			remoteWorkContained = false;
		}
	}
	const plan = planWorkBranchPublication({
		workBranch,
		workRefPrefix: input.branches.workRefPrefix,
		tipSha,
		tipTree:
			tipSha === undefined
				? undefined
				: revOrUndefined(`${tipSha}^{tree}`),
		integrationTree: git(['rev-parse', `${integration}^{tree}`]),
		remoteWorkSha,
		remoteWorkContained,
	});
	if (plan.kind === 'refused' || tipSha === undefined) {
		if (plan.kind === 'refused') {
			process.stderr.write(
				report({ kind: 'refused', refusal: plan.refusal }),
			);
		}
		return 1;
	}

	const failed = proveCommit(tipSha, worktreeRoot());
	if (failed.length > 0) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'PREFLIGHT_FAILED',
					detail: [
						`proved in isolation at ${tipSha.slice(0, 12)}; these failed:`,
						...failed.map((script) => `  bun run ${script}`),
						'',
						'Nothing was pushed and nothing was deleted.',
					],
				},
			}),
		);
		return 1;
	}
	if (input.dryRun) {
		process.stdout.write(
			`forge:publish --dry-run: ${workBranch} proved at ${tipSha.slice(0, 12)}, not pushed, not deleted.\n`,
		);
		return 0;
	}

	git(['push', 'origin', `${tipSha}:refs/heads/${ref}`]);
	const published = git(['ls-remote', 'origin', `refs/heads/${ref}`]).split(
		/\s+/u,
	)[0];
	if (published !== tipSha) {
		process.stderr.write(
			report({
				kind: 'refused',
				refusal: {
					code: 'PUBLICATION_UNVERIFIED',
					detail: [
						`${ref} is at ${published ?? 'nothing'}, not ${tipSha.slice(0, 12)}.`,
						`${workBranch} was kept: it is still the only confirmed copy.`,
					],
				},
			}),
		);
		return 1;
	}
	process.stdout.write(
		`✓ forge:publish — ${workBranch} published as ${ref} at ${tipSha.slice(0, 12)}.\n`,
	);

	if (plan.deleteRemoteWork) {
		git(['push', '-q', 'origin', '--delete', workBranch]);
		process.stdout.write(
			`✓ forge:publish — removed the remote work branch ${workBranch}; only ${ref} remains.\n`,
		);
	}
	try {
		git(['update-ref', '-d', `refs/remotes/origin/${workBranch}`]);
	} catch {
		// Nothing to prune.
	}
	const worktreeOf = gitRaw(['worktree', 'list', '--porcelain'])
		.split('\n\n')
		.find((block) => block.includes(`branch refs/heads/${workBranch}`))
		?.match(/^worktree (.+)$/mu)?.[1];
	if (worktreeOf !== undefined) {
		const dirty = gitRaw([
			'-C',
			worktreeOf,
			'status',
			'--porcelain',
		]).trim();
		if (dirty === '') {
			git(['worktree', 'remove', worktreeOf]);
			process.stdout.write(
				`✓ forge:publish — removed the clean worktree ${worktreeOf}.\n`,
			);
		} else {
			process.stdout.write(
				`! forge:publish — kept ${worktreeOf}: it has uncommitted changes. Commit or discard them, then remove it and the local branch.\n`,
			);
		}
	}
	if (
		localSha !== undefined &&
		revOrUndefined(`refs/heads/${workBranch}`) !== undefined
	) {
		try {
			git(['branch', '-D', workBranch]);
			process.stdout.write(
				`✓ forge:publish — removed the local work branch ${workBranch}.\n`,
			);
		} catch {
			// Still checked out in a kept worktree; reported above.
		}
	}

	if (!process.argv.includes('--open-pr')) return 0;
	return openPullRequest(ref, input.branches.integration, input.message);
};

if (import.meta.main) {
	process.exit(main());
}
