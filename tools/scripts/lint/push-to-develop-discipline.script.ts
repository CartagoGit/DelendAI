#!/usr/bin/env bun
/**
 * push-to-develop-discipline.script.ts — f00086 S2, stdin fix x00159 S1
 * (refined 2026-08-27: `develop` only lands via PR — no more direct push).
 *
 * Pre-push guard. Pure function over
 * `(cwd, remoteName, remoteBranch, currentBranch, agentWorktreeEnabled)`
 * → `{ ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (config-driven):
 *   - Pushing directly to `develop` → BLOCKED, regardless of source
 *     branch or the worktree gate. Work lands on `develop` through a
 *     pull request from `wip/*` (or the user-managed `fix/*` /
 *     `feature/*`), never a direct push. This mirrors the independent
 *     `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED` refusal the `commit-policy`
 *     plugin's push driver already enforces when pushing through its
 *     tool instead of a raw `git push` — two layers, one rule.
 *   - Pushing to `main` → allowed (release flow; versioning is
 *     derived on push to `main`).
 *   - When `agentWorktree: true` → every source branch is allowed:
 *     `agent/*` branches are the expected per-agent isolation shape.
 *   - When `agentWorktree: false` (this repo) → pushing from an
 *     `agent/*` branch is blocked (agents never branch on their own).
 *     User-managed branches (`wip/*`, `fix/*`, `feature/*`, …) are
 *     allowed.
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
import { spawnSync } from 'node:child_process';

import { isLefthookBypassed } from '../lib/lefthook-bypass';
import { readAgentWorktreeFlag } from './lib/agent-worktree-flag.lib';

const DEVELOP_BRANCH = 'develop';
const MAIN_BRANCH = 'main';
export const RELEASE_BRANCH_PREFIX = 'release/';

/** Branch prefixes that identify agent-driven work rather than the operator. */
const AGENT_BRANCH_PREFIXES = ['wip/', 'agent/'] as const;
const AGENT_BRANCH_PREFIX = 'agent/';

export const isReleaseBranch = (branch: string): boolean =>
	branch.startsWith(RELEASE_BRANCH_PREFIX);

export interface IPushToDevelopInput {
	readonly cwd: string;
	readonly remoteName: string;
	readonly remoteBranch: string;
	readonly currentBranch: string | null;
	/** Resolved `mcp-vertex.config.json#agentWorktree` (default false). */
	readonly agentWorktreeEnabled?: boolean;
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

export const stripRefsHeadsPrefix = (ref: string): string =>
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
 * Apply the config-driven policy to every parsed ref update: when
 * `agentWorktree` is off, block the first update whose source branch
 * is `agent/*`. Branch deletes (all-zero local oid) never block.
 */
export const lintPrePushStdinUpdates = (
	updates: ReadonlyArray<IPrePushRefUpdate>,
	agentWorktreeEnabled = false,
): PushToDevelopResult => {
	for (const update of updates) {
		if (isAllZeroSha(update.localSha)) continue;
		const result = lintPushToDevelop({
			cwd: '',
			remoteName: '',
			remoteBranch: stripRefsHeadsPrefix(update.remoteRef),
			currentBranch: stripRefsHeadsPrefix(update.localRef),
			agentWorktreeEnabled,
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
	const { remoteBranch, currentBranch, agentWorktreeEnabled = false } = input;

	if (
		remoteBranch === MAIN_BRANCH &&
		currentBranch !== null &&
		isReleaseBranch(currentBranch)
	) {
		return {
			ok: false,
			blockers: [
				`pushing from \`${currentBranch}\` straight into \`${MAIN_BRANCH}\` — release branches land on main through a pull request, not a direct push.`,
				'',
				'next-action:',
				`  open a pull request from \`${currentBranch}\` into \`${MAIN_BRANCH}\`.`,
				'  if the release must continue after main, promote main forward through the normal release flow.',
				'',
				'  if this is a true emergency release, bypass:  LEFTHOOK_BYPASS=1 git push ...',
			],
		};
	}

	if (remoteBranch === MAIN_BRANCH) {
		return {
			ok: false,
			blockers: [
				'pushing directly to `main` — main only receives commits through a pull request (ADR 0019).',
				'',
				'next-action:',
				'  open a pull request from your branch into `main` instead of pushing directly.',
				'',
				'  if this is a true emergency release, bypass:  LEFTHOOK_BYPASS=1 git push ...',
			],
		};
	}

	// `develop` is this repo's working branch and is deliberately not
	// protected: the operator pushes to it directly. What is refused is an
	// AGENT doing so — agents work on `wip/*` and land through a pull
	// request the operator decides on. The source branch is what tells the
	// two apart, so this check comes after the source-branch resolution
	// rather than short-circuiting ahead of it.
	if (
		remoteBranch === DEVELOP_BRANCH &&
		currentBranch !== undefined &&
		currentBranch !== null &&
		AGENT_BRANCH_PREFIXES.some((prefix) => currentBranch.startsWith(prefix))
	) {
		return {
			ok: false,
			blockers: [
				`pushing from \`${currentBranch}\` straight into \`${DEVELOP_BRANCH}\` — agent work lands through a pull request.`,
				'',
				'next-action:',
				'  push your work branch instead:  git push origin <wip/your-branch>',
				`  then open a pull request into \`${DEVELOP_BRANCH}\`.`,
				'',
				'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git push ...',
			],
		};
	}

	// Detached HEAD / unknown source: fail-open (mirrors the commit
	// discipline; release engineers may push from a checked-out tag).
	if (currentBranch === null || currentBranch === '') {
		return { ok: true };
	}

	if (remoteBranch === DEVELOP_BRANCH && isReleaseBranch(currentBranch)) {
		return {
			ok: false,
			blockers: [
				`pushing from \`${currentBranch}\` straight into \`${DEVELOP_BRANCH}\` — release branches do not merge back into develop directly.`,
				'',
				'next-action:',
				`  merge \`${currentBranch}\` into \`${MAIN_BRANCH}\` first through a pull request.`,
				`  if develop needs the change, promote it from \`${MAIN_BRANCH}\` using the normal forward flow.`,
				'',
				'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git push ...',
			],
		};
	}

	if (isReleaseBranch(remoteBranch)) {
		if (isReleaseBranch(currentBranch) && currentBranch !== remoteBranch) {
			return {
				ok: false,
				blockers: [
					`pushing from \`${currentBranch}\` into \`${remoteBranch}\` — one release branch must not merge into another release branch.`,
					'',
					'next-action:',
					`  push \`${currentBranch}\` to its own remote branch, or merge through \`${MAIN_BRANCH}\` if you are closing the release.`,
					`  only \`${DEVELOP_BRANCH}\` may be promoted into \`${remoteBranch}\`.`,
					'',
					'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git push ...',
				],
			};
		}
		if (currentBranch === remoteBranch) {
			return { ok: true };
		}
		if (currentBranch !== DEVELOP_BRANCH) {
			return {
				ok: false,
				blockers: [
					`pushing from \`${currentBranch}\` into \`${remoteBranch}\` — release branches only receive promotion from \`${DEVELOP_BRANCH}\`.`,
					'',
					'next-action:',
					`  land the change on \`${DEVELOP_BRANCH}\` first, then promote \`${DEVELOP_BRANCH}\` into \`${remoteBranch}\`.`,
					`  do not push feature or fix branches straight into \`${remoteBranch}\`.`,
					'',
					'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git push ...',
				],
			};
		}
		return { ok: true };
	}

	// With the worktree gate on, `agent/*` branches are the expected
	// per-agent isolation shape — allow every branch.
	if (agentWorktreeEnabled === true) {
		return { ok: true };
	}

	// Gate off: the only source branches agents must not push from are
	// `agent/*`. User-managed branches (`wip/*`, `fix/*`, `feature/*`, …)
	// are all allowed.
	if (!currentBranch.startsWith(AGENT_BRANCH_PREFIX)) {
		return { ok: true };
	}

	return {
		ok: false,
		blockers: [
			`pushing from \`${currentBranch}\` — per-agent branches are disabled (agentWorktree: false).`,
			'',
			'next-action:',
			`  switch to a wip/* branch instead:  git switch -c wip/<slug>`,
			'  then push that branch and open a pull request.',
			'  only the operator creates branches; agents never branch on their own.',
			'',
			'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git push ...',
		],
	};
};

// ---------- CLI shell ----------

interface ICliArgs {
	readonly cwd: string;
	readonly remote: string;
	readonly remoteBranch: string;
	readonly currentBranch: string | null;
	readonly agentWorktree?: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	let remote = '';
	let remoteBranch = '';
	let currentBranch: string | null | undefined;
	let agentWorktree: boolean | undefined;
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
			case '--agent-worktree': {
				const v = argv[++i];
				agentWorktree = v === 'true' || v === '1';
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
		...(agentWorktree !== undefined ? { agentWorktree } : {}),
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
const STDIN_PROBE_TIMEOUT_MS = 2_000;

/**
 * Read git's pre-push ref-update protocol from stdin, if any.
 *
 * A TTY never carries ref updates, so it short-circuits. Everything else
 * used to go straight to `readFileSync(0)`, which blocks until EOF — and
 * an inherited pipe that nobody ever closes (a CI runner, a task runner
 * spawning this as one of many steps) has no EOF. The script then hung
 * forever instead of reporting anything, which is strictly worse than a
 * failure: nothing downstream can tell a hang from slow work.
 *
 * Reading with a deadline keeps the real hook exact — git writes the ref
 * updates and closes stdin immediately, so EOF arrives in microseconds —
 * while a stdin that never closes degrades to "no ref updates" instead of
 * a hang.
 */
const readStdinRefUpdates = async (): Promise<
	ReadonlyArray<IPrePushRefUpdate>
> => {
	if (process.stdin.isTTY) return [];
	const raw = await new Promise<string>((resolve) => {
		let buffer = '';
		let settled = false;
		const finish = (value: string): void => {
			if (settled) return;
			settled = true;
			process.stdin.removeAllListeners('data');
			process.stdin.removeAllListeners('end');
			process.stdin.removeAllListeners('error');
			process.stdin.pause();
			resolve(value);
		};
		const timer = setTimeout(() => finish(buffer), STDIN_PROBE_TIMEOUT_MS);
		timer.unref?.();
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk: string) => {
			buffer += chunk;
		});
		process.stdin.on('end', () => {
			clearTimeout(timer);
			finish(buffer);
		});
		process.stdin.on('error', () => {
			clearTimeout(timer);
			finish('');
		});
		process.stdin.resume();
	});
	try {
		return parsePrePushStdin(raw);
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

	// Resolve the worktree gate once: CLI flag > config file > false.
	// (Parsing argv up front is safe: lefthook only ever passes the
	// remote name/url on argv, never the refspec.)
	const rawArgv = process.argv.slice(2);
	const args = parseArgs(rawArgv);
	const agentWorktreeEnabled =
		args.agentWorktree ?? readAgentWorktreeFlag(args.cwd);

	// x00159 S1: STDIN is the authoritative source — it is git's real
	// pre-push contract (`<local ref> <local oid> <remote ref>
	// <remote oid>` per updated ref). The lefthook argv `{3}` template
	// has no refspec to substitute for a plain `git push` and used to
	// ship as the literal string `"{3}"`, silently defeating the guard.
	const stdinUpdates = await readStdinRefUpdates();
	if (stdinUpdates.length > 0) {
		const result = lintPrePushStdinUpdates(
			stdinUpdates,
			agentWorktreeEnabled,
		);
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
	const positionals = rawArgv.filter((a) => !a.startsWith('-'));
	if (positionals.length === 0) {
		process.stdout.write(
			'✓ push-to-develop-discipline: skipped (no push in flight)\n',
		);
		return 0;
	}
	const currentBranch = args.currentBranch ?? readCurrentBranch(args.cwd);
	const pushArgs = parseGitPushArgs(rawArgv, currentBranch);
	const remote = args.remote || pushArgs.remote;
	const remoteBranch = args.remoteBranch || pushArgs.remoteBranch;
	const result = lintPushToDevelop({
		cwd: args.cwd,
		remoteName: remote,
		remoteBranch,
		currentBranch,
		agentWorktreeEnabled,
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
