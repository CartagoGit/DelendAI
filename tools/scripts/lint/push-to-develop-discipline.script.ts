#!/usr/bin/env bun
/**
 * push-to-develop-discipline.script.ts — f00086 S2, stdin fix x00159 S1
 * (policy flipped 2026-08-24: single shared `develop` branch).
 *
 * Pre-push guard. Pure function over
 * `(cwd, remoteName, remoteBranch, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (single shared branch):
 *   - This repo works on ONE branch: `develop`. Agents share commits
 *     and pushes instead of creating per-agent branches.
 *   - Pushing from `develop` → always allowed (the shared push, and
 *     `develop → main` release merges).
 *   - Pushing from `main` → allowed (release flow; versioning is
 *     derived on push to `main`).
 *   - Any other source branch (`agent/*`, `feature/*`, …) → blocked
 *     with a next-action telling the agent to switch back to develop.
 *   - Branch deletes (all-zero local oid) never block.
 *
 * x00159 S1: the refs actually being pushed are NOT available as a
 * third CLI argument. Git's real pre-push hook contract passes only
 * `<remote name> <remote url>` on argv; every updated ref arrives as
 * a STDIN line (`<local ref> <local oid> <remote ref> <remote oid>`).
 * lefthook's `{3}` template has nothing to substitute for a plain
 * `git push`, so it was shipping the literal, unsubstituted string
 * `"{3}"` as argv[2] — which silently parsed as "not develop" and
 * defeated this entire guard for the exact case it exists to catch
 * (reproduced live: `git push` on `develop` printed `✓ ok` and
 * pushed straight through). `main()` now reads the real stdin
 * contract first; the argv-based parsing stays only as a fallback
 * for direct/manual invocation (and the existing unit tests).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { isLefthookBypassed } from '../lib/lefthook-bypass';

const DEVELOP_BRANCH = 'develop';
const MAIN_BRANCH = 'main';

export interface IPushToDevelopInput {
	readonly cwd: string;
	readonly remoteName: string;
	readonly remoteBranch: string;
	readonly currentBranch: string | null;
}

export type PushToDevelopResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

export interface IPrePushRefUpdate {
	readonly localRef: string;
	readonly localSha: string;
	readonly remoteRef: string;
	readonly remoteSha: string;
}

const REFS_HEADS_PREFIX = 'refs/heads/';

const stripRefsHeadsPrefix = (ref: string): string =>
	ref.startsWith(REFS_HEADS_PREFIX)
		? ref.slice(REFS_HEADS_PREFIX.length)
		: ref;

/** All-zero SHA marks a branch delete in the pre-push stdin protocol. */
const isAllZeroSha = (sha: string): boolean => /^0+$/.test(sha);

/**
 * Parse git's actual pre-push hook STDIN contract: one line per ref
 * being updated, `<local ref> SP <local oid> SP <remote ref> SP
 * <remote oid>`. This is the authoritative source for "what is being
 * pushed where" — unlike the hook's argv, which only ever carries
 * `<remote name> <remote url>`.
 */
export const parsePrePushStdin = (
	stdin: string,
): ReadonlyArray<IPrePushRefUpdate> => {
	const updates: IPrePushRefUpdate[] = [];
	for (const line of stdin.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		const parts = trimmed.split(/\s+/);
		if (parts.length !== 4) continue;
		const [localRef, localSha, remoteRef, remoteSha] = parts as [
			string,
			string,
			string,
			string,
		];
		updates.push({ localRef, localSha, remoteRef, remoteSha });
	}
	return updates;
};

/**
 * Apply the single-shared-branch policy to every parsed ref update:
 * block the first update whose source branch is not `develop` or
 * `main`. Branch deletes (all-zero local oid) never block.
 */
export const lintPrePushStdinUpdates = (
	updates: ReadonlyArray<IPrePushRefUpdate>,
): PushToDevelopResult => {
	for (const update of updates) {
		if (isAllZeroSha(update.localSha)) continue;
		const result = lintPushToDevelop({
			cwd: '',
			remoteName: '',
			remoteBranch: stripRefsHeadsPrefix(update.remoteRef),
			currentBranch: stripRefsHeadsPrefix(update.localRef),
		});
		if (!result.ok) return result;
	}
	return { ok: true };
};

/**
 * Parse `git push` argv into a `{ remote, remoteBranch }` pair.
 * Falls back to the current branch + `origin` when the args are
 * absent (mirrors git's own defaults for a bare `git push`).
 *
 * lefthook passes three positional args to the pre-push hook:
 * `{1} {2} {3} = remote_name remote_url refspec`. The refspec
 * is the third positional (`refs/heads/local:refs/heads/remote`
 * or a bare branch name). A bare `git push` with no refspec
 * passes two (`remote_name remote_url`) — we fall back to the
 * current branch in that case. A unit test of `git push` from
 * the shell (no lefthook) passes one (`remote_name` or a bare
 * branch).
 */
export const parseGitPushArgs = (
	argv: readonly string[],
	currentBranchFallback: string | null,
): { readonly remote: string; readonly remoteBranch: string } => {
	let remote = 'origin';
	let remoteBranch: string | undefined;
	const positional: string[] = [];
	for (const arg of argv) {
		if (arg.startsWith('-')) continue;
		positional.push(arg);
	}
	if (positional[0]) remote = positional[0];
	// The refspec is the LAST positional. With three args
	// (`remote url refspec`) the URL is the middle one and must
	// be skipped — its colons would otherwise be misread as the
	// refspec's source:target separator.
	const ref = positional.length >= 3 ? positional[2] : positional[1];
	if (ref) {
		const colonIdx = ref.indexOf(':');
		const raw = colonIdx >= 0 ? ref.slice(colonIdx + 1) : ref;
		// Strip the `refs/heads/` prefix when present so the
		// caller gets a bare branch name (e.g. `develop` instead
		// of `refs/heads/develop`).
		remoteBranch = raw.startsWith('refs/heads/')
			? raw.slice('refs/heads/'.length)
			: raw;
	}
	if (remoteBranch === undefined) {
		remoteBranch = currentBranchFallback ?? DEVELOP_BRANCH;
	}
	return { remote, remoteBranch };
};

/** Pure decision engine. No I/O, no side effects. */
export const lintPushToDevelop = (
	input: IPushToDevelopInput,
): PushToDevelopResult => {
	const { currentBranch } = input;
	const blockers: string[] = [];

	// Detached HEAD / unknown source: fail-open (mirrors the commit
	// discipline; release engineers may push from a checked-out tag).
	if (currentBranch === null || currentBranch === '') {
		return { ok: true };
	}

	// The shared branch and the release branch are both allowed
	// sources. Everything else is a stray per-agent / feature
	// branch this repo does not want.
	if (currentBranch === DEVELOP_BRANCH || currentBranch === MAIN_BRANCH) {
		return { ok: true };
	}

	// Anything else: no new branches. Switch back to develop and push
	// the shared branch.
	blockers.push(
		`pushing from \`${currentBranch}\` — this repo works on \`develop\` only.`,
		'',
		'next-action:',
		`  switch back:  git switch ${DEVELOP_BRANCH}`,
		'  then commit and push on develop. agents share one branch;',
		'  do not push agent/* or feature/* branches.',
		'',
		'  if this is a true emergency (CI follow-up, release hotfix),',
		'  bypass the hook with:  LEFTHOOK_BYPASS=1 git push ...',
	);
	return { ok: false, blockers };
};

// ---------- CLI shell ----------

interface ICliArgs {
	readonly cwd: string;
	readonly remote: string;
	readonly remoteBranch: string;
	readonly currentBranch: string | null;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	let remote = '';
	let remoteBranch = '';
	let currentBranch: string | null | undefined;
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--remote':
				remote = argv[++i] ?? '';
				break;
			case '--remote-branch':
				remoteBranch = argv[++i] ?? '';
				break;
			case '--current-branch': {
				const v = argv[++i];
				currentBranch = v === undefined ? null : v;
				break;
			}
			default:
				if (arg && !arg.startsWith('--')) {
					positional.push(arg);
				}
				break;
		}
	}
	if (!remote && positional[0]) remote = positional[0];
	// `refs` is the third positional from lefthook. It looks like
	// `refs/heads/source:refs/heads/target` (or space-separated
	// for multi-ref pushes). For a typical
	// `git push origin develop` the value is
	// `refs/heads/develop:refs/heads/develop`.
	const refsArg = positional[2] ?? positional[1] ?? '';
	if (refsArg.includes(':')) {
		const [local, remote2] = refsArg.split(':', 2);
		if (local?.startsWith('refs/heads/')) {
			currentBranch = currentBranch ?? local.slice('refs/heads/'.length);
		}
		if (remote2?.startsWith('refs/heads/')) {
			remoteBranch = remote2.slice('refs/heads/'.length);
		}
	}
	return {
		cwd,
		remote,
		remoteBranch,
		currentBranch: currentBranch ?? null,
	};
};

const readCurrentBranch = (cwd: string): string | null => {
	const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
		cwd,
		encoding: 'utf8',
	});
	if (res.status !== 0) return null;
	const out = (res.stdout ?? '').trim();
	if (out === 'HEAD' || out === '') return null;
	return out;
};

const formatReport = (result: PushToDevelopResult): string => {
	if (result.ok) {
		return '✓ push-to-develop-discipline: ok\n';
	}
	return [
		'✗ push-to-develop-discipline: blocked',
		'',
		...result.blockers,
		'',
	].join('\n');
};

/**
 * x00159 S1: read the pre-push hook's real STDIN payload. A TTY
 * (interactive shell, no piped data) never has ref updates to read —
 * probing it would block waiting for keyboard input — so it short-
 * circuits to empty rather than calling `readFileSync(0, ...)`.
 */
const readStdinRefUpdates = (): ReadonlyArray<IPrePushRefUpdate> => {
	if (process.stdin.isTTY) return [];
	try {
		return parsePrePushStdin(readFileSync(0, 'utf8'));
	} catch {
		return [];
	}
};

const main = async (): Promise<number> => {
	// x00159 S2: honour the documented escape hatch for real. Every
	// blocker message below tells the operator to set
	// LEFTHOOK_BYPASS=1 — lefthook itself has no such variable, so
	// this script must be the one to check it.
	if (isLefthookBypassed()) {
		process.stdout.write(
			'✓ push-to-develop-discipline: bypassed (LEFTHOOK_BYPASS=1)\n',
		);
		return 0;
	}

	// x00159 S1: STDIN is the authoritative source — it is git's real
	// pre-push contract (`<local ref> <local oid> <remote ref>
	// <remote oid>` per updated ref). The lefthook argv `{3}` template
	// has no refspec to substitute for a plain `git push` and used to
	// ship as the literal string `"{3}"`, silently defeating the guard.
	const stdinUpdates = readStdinRefUpdates();
	if (stdinUpdates.length > 0) {
		const result = lintPrePushStdinUpdates(stdinUpdates);
		const report = formatReport(result);
		if (result.ok) {
			process.stdout.write(report);
			return 0;
		}
		process.stderr.write(report);
		return 1;
	}

	// Fallback: no stdin ref data (manual/direct invocation, e.g. a
	// developer running `bun run lint:push-to-develop` by hand, or the
	// explicit --flags used by this script's own tests). Smoke-test
	// carve-out: with zero positional args and no stdin, there is no
	// push in flight to discipline (e.g. `bun run validate` chains
	// this lint outside of any real `git push`).
	const rawArgv = process.argv.slice(2);
	const positionals = rawArgv.filter((a) => !a.startsWith('-'));
	if (positionals.length === 0) {
		process.stdout.write(
			'✓ push-to-develop-discipline: skipped (no push in flight)\n',
		);
		return 0;
	}
	const args = parseArgs(rawArgv);
	const currentBranch = args.currentBranch ?? readCurrentBranch(args.cwd);
	const pushArgs = parseGitPushArgs(rawArgv, currentBranch);
	const remote = args.remote || pushArgs.remote;
	const remoteBranch = args.remoteBranch || pushArgs.remoteBranch;
	const result = lintPushToDevelop({
		cwd: args.cwd,
		remoteName: remote,
		remoteBranch,
		currentBranch,
	});
	const report = formatReport(result);
	if (result.ok) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
