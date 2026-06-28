#!/usr/bin/env bun
/**
 * commit-msg-conventional.script.ts — f00086 S3.
 *
 * commit-msg guard. Reads the commit message file (path passed as
 * `process.argv[2]`), validates the first line against the
 * Conventional Commits format used by `derive-version.ts`.
 *
 * Policy (f00086):
 *   - First line MUST match
 *       /^(feat|fix|chore|docs|refactor|test|build|ci|perf|style)
 *         (\([a-z0-9_-]+\))?!?: /
 *     OR start with `Merge ` / `Revert ` (git-generated merge
 *     / revert commits that should not be reformatted by the
 *     agent).
 *   - The subject after the colon is NOT validated for length,
 *     case, or punctuation. Only the prefix matters.
 *   - Empty / whitespace-only / body-only messages are blocked.
 *   - When called with no message file (the `bun run validate`
 *     smoke test), the script falls back to reading the most
 *     recent commit's message via `git log -1 --pretty=format:%B`.
 *     This makes the validate chain meaningful even outside a
 *     commit-msg hook.
 */
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

/** Conventional Commits prefix list (kept in sync with `derive-version.ts`). */
export const CONVENTIONAL_PREFIXES: readonly string[] = [
	'feat',
	'fix',
	'chore',
	'docs',
	'refactor',
	'test',
	'build',
	'ci',
	'perf',
	'style',
];

/** First line: Conventional Commits with optional scope and `!` marker. */
export const CONVENTIONAL_RE =
	/^(feat|fix|chore|docs|refactor|test|build|ci|perf|style)(\([a-z0-9_-]+\))?!?: /;

/** Merge / revert commits are git-generated and exempt. */
export const MERGE_REVERT_RE = /^(Merge |Revert )/;

export type CommitMsgResult =
	| { readonly ok: true; readonly firstLine: string }
	| { readonly ok: false; readonly blockers: readonly string[] };

/** Pure classifier over a raw message body. */
export const lintCommitMessage = (rawMessage: string): CommitMsgResult => {
	const blockers: string[] = [];
	const firstLine = rawMessage.split('\n', 1)[0]?.trim() ?? '';

	if (firstLine === '') {
		blockers.push(
			'commit message is empty.',
			'',
			'next-action:',
			'  use conventional commits:  feat(scope): subject',
			`  (allowed: ${CONVENTIONAL_PREFIXES.join(', ')})`,
		);
		return { ok: false, blockers };
	}

	if (firstLine.startsWith('#')) {
		blockers.push(
			`commit message starts with a comment: \`${firstLine}\``,
			'',
			'next-action:',
			'  the first line MUST be a conventional commit subject.',
			'  example:  feat(proposals): f00086 swarm commit discipline',
		);
		return { ok: false, blockers };
	}

	if (CONVENTIONAL_RE.test(firstLine)) {
		return { ok: true, firstLine };
	}
	if (MERGE_REVERT_RE.test(firstLine)) {
		return { ok: true, firstLine };
	}

	blockers.push(
		`commit subject \`${firstLine}\` is not a conventional commit.`,
		'',
		'next-action:',
		'  use conventional commits:  feat(scope): subject',
		`  (allowed: ${CONVENTIONAL_PREFIXES.join(', ')})`,
		'  merge commits (`Merge ...`) and revert commits',
		'  (`Revert ...`) are exempt.',
	);
	return { ok: false, blockers };
};

/** Read a file's contents as utf8. Wraps `readFile` so it can be stubbed. */
export const readMessageFile = async (path: string): Promise<string> => {
	const text = await readFile(path, 'utf8');
	return text;
};

/**
 * Read the most recent commit's message via
 * `git log -1 --pretty=format:%B`. Used as the fallback in
 * `bun run validate` mode when no message file is provided — the
 * gate is "the most recent commit on this branch follows
 * conventional commits", and the gate runs against the
 * already-committed state.
 */
export const readLastCommitMessage = (cwd: string): string | null => {
	const res = spawnSync(
		'git',
		['log', '-1', '--pretty=format:%B'],
		{ cwd, encoding: 'utf8' },
	);
	if (res.status !== 0) return null;
	return res.stdout ?? '';
};

// ---------- CLI shell ----------

interface ICliArgs {
	readonly cwd: string;
	readonly messagePath: string | null;
	readonly messageInline: string | null;
	readonly fromLastCommit: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	let messagePath: string | null = null;
	let messageInline: string | null = null;
	let fromLastCommit = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--message':
			case '-m':
				messageInline = argv[++i] ?? '';
				break;
			case '--last-commit':
				fromLastCommit = true;
				break;
			default:
				if (messagePath === null && arg && !arg.startsWith('--')) {
					messagePath = arg;
				}
				break;
		}
	}
	return { cwd, messagePath, messageInline, fromLastCommit };
};

const formatReport = (result: CommitMsgResult): string => {
	if (result.ok) {
		return `✓ commit-msg-conventional: ok (${result.firstLine})\n`;
	}
	return [
		'✗ commit-msg-conventional: blocked',
		'',
		...result.blockers,
		'',
	].join('\n');
};

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	let message: string;
	if (args.messageInline !== null) {
		message = args.messageInline;
	} else if (args.messagePath !== null) {
		try {
			message = await readMessageFile(args.messagePath);
		} catch (err) {
			process.stderr.write(
				`✗ commit-msg-conventional: cannot read message file \`${args.messagePath}\`: ${(err as Error).message}\n`,
			);
			return 1;
		}
	} else {
		const last = readLastCommitMessage(args.cwd);
		if (last === null) {
			process.stderr.write(
				'✗ commit-msg-conventional: no message provided and git log returned no commits. pass a path or --message "..."\n',
			);
			return 1;
		}
		message = last;
	}
	const result = lintCommitMessage(message);
	const report = formatReport(result);
	if (result.ok) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

process.exit(await main());
