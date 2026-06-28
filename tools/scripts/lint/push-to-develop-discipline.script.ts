#!/usr/bin/env bun
/**
 * push-to-develop-discipline.script.ts — f00086 S2.
 *
 * Pre-push guard. Pure function over
 * `(cwd, remoteName, remoteBranch, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (f00086):
 *   - The interesting case is `remoteBranch === 'develop'` AND
 *     `currentBranch === 'develop'` → block. The agent forgot to
 *     open a feature branch.
 *   - Pushing `develop` from a feature branch (the PR-merge
 *     shape) is allowed.
 *   - Pushing any other branch to any other remote is allowed.
 *   - Pushing to a non-develop remote branch is always allowed.
 */
import { spawnSync } from 'node:child_process';

const DEVELOP_BRANCH = 'develop';

export interface IPushToDevelopInput {
	readonly cwd: string;
	readonly remoteName: string;
	readonly remoteBranch: string;
	readonly currentBranch: string | null;
}

export type PushToDevelopResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

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
	const { remoteBranch, currentBranch } = input;
	const blockers: string[] = [];

	// Pushing to a non-develop branch is always allowed.
	if (remoteBranch !== DEVELOP_BRANCH) {
		return { ok: true };
	}

	// Pushing to develop from a feature branch is the PR-merge
	// shape. Allow it; the actual merge is the maintainer's
	// decision.
	if (currentBranch !== DEVELOP_BRANCH) {
		return { ok: true };
	}

	// develop → develop from develop is the only case we block.
	blockers.push(
		`pushing \`${currentBranch}\` → \`origin/${remoteBranch}\` directly.`,
		'',
		'next-action:',
		'  create a feature branch:  git switch -c agent/<your-name>-<id>',
		'  push there:                git push -u origin agent/<your-name>-<id>',
		'  open a PR; the PR-merge is what lands on develop.',
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

const main = async (): Promise<number> => {
	const rawArgv = process.argv.slice(2);
	// Smoke-test carve-out: when the CLI is invoked with NO
	// positional args (e.g. `bun run validate` chains the lint
	// outside of any real `git push`), there is no push in
	// flight to discipline. Return a no-op success so the
	// validate chain does not false-positive on every develop
	// build. The discipline is still enforced by lefthook's
	// pre-push hook, which always passes the real refspec
	// (`{1} {2} {3} = remote remote_url refs`).
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
