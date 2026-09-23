#!/usr/bin/env bun

/**
 * forward-sync-release — bring the release branch back into the
 * integration branch, through a pull request, every time it moves.
 *
 * WHY this exists: promoting the integration branch is a pull request
 * into the release branch, and merging it writes a merge commit that
 * only the release branch has. From then on the integration branch is
 * "1 behind" the release branch, and it stays that way, because nothing
 * carries the commit back. Measured on 2026-09-15: develop 136 ahead and
 * 1 behind main, the one being the merge of #178.
 *
 * One behind with no content is noise. The same gap with a hotfix in it
 * is a fix the next promotion silently reverts, and the counts cannot
 * tell those two apart. So this script measures which one it is before
 * it does anything.
 *
 * WHAT IT DELIBERATELY WILL NOT DO: it never pushes to either protected
 * branch, never force-pushes, never resolves a conflict, and never
 * reports success for a pull request it could not open. The integration
 * branch requires a pull request and its required check; this script
 * opens the first, asks for the second, and the forge decides.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

import type {
	IForwardSyncBranches,
	IForwardSyncOpenDeps,
	IForwardSyncFacts,
	IForwardSyncVerdict,
} from './forward-sync-release.interface';
import { SYNC_REMOTE } from './sync-with-integration.constant';

export type {
	IForwardSyncBranches,
	IForwardSyncFacts,
	IForwardSyncOpenDeps,
	IForwardSyncVerdict,
} from './forward-sync-release.interface';

const APPLY = process.argv.includes('--apply');

/** Inside the one namespace the forge lets anyone create refs in. */
export const FORWARD_SYNC_REF_PREFIX = 'delendai/pr/forward-sync-';

/**
 * What carrying the release tip back amounts to, from facts alone.
 *
 * Pure for the same reason `localSyncVerdict` is: the decision is the
 * dangerous half, and arithmetic can be pinned by cases.
 */
export const forwardSyncVerdict = (
	facts: IForwardSyncFacts,
): IForwardSyncVerdict => {
	if (facts.releaseIsAncestor) return 'in-sync';
	if (facts.conflicts) return 'conflict';
	return facts.treeChanges ? 'content' : 'ancestry-only';
};

/** One candidate per release tip, so a rerun finds the one it opened. */
export const forwardSyncRef = (releaseSha: string): string =>
	`${FORWARD_SYNC_REF_PREFIX}${releaseSha.slice(0, 9)}`;

/** The one-line reason, so the verdict never travels without it. */
export const forwardSyncExplanation = (
	verdict: IForwardSyncVerdict,
	branches: IForwardSyncBranches,
	releaseSha: string,
): string => {
	const tip = `${branches.release} (${releaseSha.slice(0, 9)})`;
	if (verdict === 'in-sync')
		return `${tip} is already in ${branches.integration}'s history. Nothing to carry back.`;
	if (verdict === 'ancestry-only')
		return `${tip} is not in ${branches.integration}'s history, but merging it changes no file: it is history only, typically the merge commit a promotion leaves behind.`;
	if (verdict === 'content')
		return `${tip} carries changes ${branches.integration} does not have. The next promotion would revert them unless they come back first.`;
	return `merging ${tip} into ${branches.integration} stops on a conflict. Resolving it is a decision for a person, not for this script.`;
};

/** Conventional, because every commit in this repository is. */
export const forwardSyncTitle = (
	branches: IForwardSyncBranches,
	releaseSha: string,
): string =>
	`chore(release): forward-sync ${branches.release} ${releaseSha.slice(0, 9)} into ${branches.integration}`;

export const forwardSyncBody = (
	verdict: IForwardSyncVerdict,
	branches: IForwardSyncBranches,
	releaseSha: string,
): string =>
	[
		`Carries \`${branches.release}\` at \`${releaseSha.slice(0, 9)}\` back into \`${branches.integration}\`.`,
		'',
		forwardSyncExplanation(verdict, branches, releaseSha),
		'',
		verdict === 'ancestry-only'
			? 'It changes no file on purpose. `lint:candidate-delivers` accepts it only because it makes the release tip an ancestor of its base.'
			: 'Review the diff: these changes reached the release branch without passing through the integration branch.',
		'',
		'Opened by `bun run forge:forward-sync -- --apply`.',
	].join('\n');

const run = (command: string, args: readonly string[], cwd = repoRoot()) => {
	const result = spawnSync(command, [...args], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});
	return {
		ok: result.status === 0,
		out: (result.stdout ?? '').trim(),
		err: (result.stderr ?? '').trim(),
	};
};

const must = (
	command: string,
	args: readonly string[],
	cwd = repoRoot(),
): string => {
	const result = run(command, args, cwd);
	if (!result.ok) {
		throw new Error(
			`forward-sync-release: \`${command} ${args.join(' ')}\` failed: ${result.err}`,
		);
	}
	return result.out;
};

/**
 * Stop, and say so where somebody will read it.
 *
 * A non-zero exit on a push to the release branch is a red run on the
 * branch people look at; the step summary says what to do about it.
 */
const refuse = (lines: readonly string[]): number => {
	process.stderr.write(`${lines.join('\n')}\n`);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary !== undefined && summary !== '') {
		appendFileSync(
			summary,
			[
				'### forward-sync-release needs a person',
				'',
				...lines.map((line) => `    ${line}`),
				'',
			].join('\n'),
		);
	}
	return 1;
};

/**
 * Open the pull request, make sure its check will run, and only then arm
 * it.
 *
 * A workflow token's push and pull request start no workflow, so in a
 * workflow run the required check would never report. A dispatch is the
 * one event such a token may start. Locally the pull request is opened
 * with the person's own credential and builds like any other.
 *
 * WHY the dispatch comes before the arming, which is the whole of this
 * change: auto-merge is a standing promise to land the branch the moment
 * its checks pass. Armed behind a check that was never started, that
 * promise waits forever and looks exactly like a queue that is simply
 * slow — a pull request with no red mark, no pending run, and nobody
 * looking. Arming last means a failed dispatch leaves a pull request that
 * is plainly unfinished and names what to do, which somebody notices.
 */
export const openCandidate = (
	verdict: IForwardSyncVerdict,
	branches: IForwardSyncBranches,
	releaseSha: string,
	ref: string,
	deps: IForwardSyncOpenDeps = {
		run,
		refuse,
		log: (line) => {
			console.log(line);
		},
		inActions: () => process.env.GITHUB_ACTIONS === 'true',
	},
): number => {
	const created = deps.run('gh', [
		'pr',
		'create',
		'--base',
		branches.integration,
		'--head',
		ref,
		'--title',
		forwardSyncTitle(branches, releaseSha),
		'--body',
		forwardSyncBody(verdict, branches, releaseSha),
	]);
	if (!created.ok) {
		return deps.refuse([
			`✗ forward-sync-release: pushed ${ref}, and the forge refused to open its pull request.`,
			'',
			`  ${created.err}`,
			'',
			'  A workflow token cannot open pull requests unless the repository',
			'  allows GitHub Actions to create them.',
			'',
			'next-action:',
			`  gh pr create --base ${branches.integration} --head ${ref} --fill`,
		]);
	}
	deps.log(`forward-sync-release: opened ${created.out}`);
	// In a workflow run the required check has to be started explicitly,
	// and nothing may be armed until it has been.
	if (deps.inActions()) {
		const dispatched = deps.run('gh', [
			'workflow',
			'run',
			'ci.yml',
			'--ref',
			ref,
		]);
		if (!dispatched.ok) {
			return deps.refuse([
				`✗ forward-sync-release: opened ${created.out}, and its required check was not started.`,
				'',
				`  ${dispatched.err}`,
				'',
				'  Auto-merge was NOT armed: a pull request armed behind a check',
				'  that never starts waits forever and looks like a slow queue.',
				'  This one needs a person.',
				'',
				'next-action:',
				`  gh workflow run ci.yml --ref ${ref}`,
				`  gh pr merge ${ref} --auto --merge`,
			]);
		}
		deps.log(
			`forward-sync-release: started ci.yml on ${ref} for the required check.`,
		);
	}
	const armed = deps.run('gh', ['pr', 'merge', ref, '--auto', '--merge']);
	if (!armed.ok) {
		return deps.refuse([
			`✗ forward-sync-release: opened ${created.out} and could not arm auto-merge.`,
			'',
			`  ${armed.err}`,
			'',
			'next-action:',
			`  gh pr merge ${ref} --auto --merge`,
		]);
	}
	return 0;
};

const main = (): number => {
	const branches = declaredBranches();
	const integration = `${SYNC_REMOTE}/${branches.integration}`;
	const release = `${SYNC_REMOTE}/${branches.release}`;
	must('git', [
		'fetch',
		'--quiet',
		SYNC_REMOTE,
		branches.integration,
		branches.release,
	]);
	const releaseSha = must('git', ['rev-parse', release]);

	if (run('git', ['merge-base', '--is-ancestor', release, integration]).ok) {
		console.log(
			`forward-sync-release: in-sync — ${forwardSyncExplanation('in-sync', branches, releaseSha)}`,
		);
		return 0;
	}

	const ref = forwardSyncRef(releaseSha);
	const open = must('gh', [
		'pr',
		'list',
		'--head',
		ref,
		'--state',
		'open',
		'--json',
		'url',
		'--jq',
		'.[0].url // ""',
	]);
	if (open !== '') {
		console.log(
			`forward-sync-release: ${open} already carries ${releaseSha.slice(0, 9)} back; nothing to open.`,
		);
		return 0;
	}
	if (
		run('git', ['ls-remote', '--exit-code', '--heads', SYNC_REMOTE, ref]).ok
	) {
		return refuse([
			`✗ forward-sync-release: ${ref} exists on the forge with no open pull request.`,
			'',
			'  Somebody closed it, or is working on it. It is not overwritten.',
			'',
			'next-action:',
			`  reopen its pull request, or delete ${ref} and rerun this script.`,
		]);
	}

	// The merge is tried in a throwaway worktree so the checkout somebody
	// is editing in never moves, and a conflict leaves nothing behind.
	const dir = mkdtempSync(join(tmpdir(), 'forward-sync-'));
	try {
		must('git', [
			'worktree',
			'add',
			'--detach',
			'--quiet',
			dir,
			integration,
		]);
		const merged = run(
			'git',
			[
				'merge',
				'--no-ff',
				'-m',
				forwardSyncTitle(branches, releaseSha),
				release,
			],
			dir,
		);
		const verdict = forwardSyncVerdict({
			releaseIsAncestor: false,
			conflicts: !merged.ok,
			treeChanges:
				merged.ok &&
				must('git', ['rev-parse', 'HEAD^{tree}'], dir) !==
					must('git', ['rev-parse', `${integration}^{tree}`]),
		});
		const explanation = forwardSyncExplanation(
			verdict,
			branches,
			releaseSha,
		);
		if (verdict === 'conflict') {
			return refuse([
				`✗ forward-sync-release: ${explanation}`,
				'',
				`  ${merged.err || merged.out}`,
				'',
				'next-action:',
				`  merge ${release} into a branch cut from ${integration}, resolve it,`,
				`  and open the pull request by hand.`,
			]);
		}
		console.log(`forward-sync-release: ${verdict} — ${explanation}`);
		if (!APPLY) {
			console.log(
				`forward-sync-release: would push ${ref} and open a pull request into ${branches.integration} (pass --apply).`,
			);
			return 0;
		}
		// Pushed by SHA from the installed checkout, not from the throwaway
		// worktree. The pre-push hooks are shared by every worktree and run
		// the repository's lints, which need `node_modules`; a worktree
		// under the system temp directory has none, so a push from there
		// dies on `Cannot find module` before anything reaches the forge.
		const mergedSha = must('git', ['rev-parse', 'HEAD'], dir);
		must('git', [
			'push',
			'--quiet',
			SYNC_REMOTE,
			`${mergedSha}:refs/heads/${ref}`,
		]);
		return openCandidate(verdict, branches, releaseSha, ref);
	} finally {
		run('git', ['worktree', 'remove', '--force', dir]);
		rmSync(dir, { recursive: true, force: true });
	}
};

if (import.meta.main) process.exit(main());
