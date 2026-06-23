/**
 * Write-side git tools: `git_commit` and `git_push`. Unlike the rest of
 * `@mcp-vertex/git` (status/changed/diff/log/blame/show/worktree — all
 * read-only), these two mutate the repository. They are kept in their
 * own module and registered separately so a host can audit/gate them
 * independently of the read-only surface (R1 in f00020: write tools
 * break the plugin's read-only posture, so they are opt-in only).
 *
 * The actual git mechanics (stage/commit/push) live in
 * `@mcp-vertex/core`'s `packages/core/src/lib/shared/git-write.ts` —
 * this module only owns the git-plugin-specific POLICY layered on top:
 * Conventional-Commit message validation, the `--amend` ownership guard,
 * and the protected-branch push refusal.
 */
import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import {
	commitAndPush,
	gitLastCommitAuthor,
	toolError,
	toolOk,
} from '@mcp-vertex/core/public';

import { checkRepo } from '../services/git';
import type { IGitRunner } from '../services/git';

const NOT_A_REPO = (reason = 'not a git repository') =>
	toolError(
		reason,
		reason.includes('not available')
			? 'Install git or run where git is on PATH.'
			: 'Run inside a git working tree.',
	);

export interface IGitWriteToolOptions {
	readonly namespacePrefix: string;
	readonly run: IGitRunner;
	/**
	 * Branches that `git_push` always refuses to target, regardless of
	 * `force`. Default: `['main', 'master']` (AGENTS.md: "no commit-back
	 * loop on main"; `master` covers the older default branch name).
	 */
	readonly protectedBranches?: readonly string[];
}

const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ['main', 'master'];

// ---------------------------------------------------------------------------
// Conventional Commits validation
// ---------------------------------------------------------------------------

/**
 * Recognised Conventional Commit types (the standard set; matches real
 * usage in this repo's own `git log`, e.g. `feat(core): …`, `fix(cli): …`,
 * `refactor: …`, `docs(proposals): …`). A scope in parens and/or a `!`
 * (breaking-change marker) before the colon are both optional.
 */
const CONVENTIONAL_COMMIT_TYPES: readonly string[] = [
	'feat',
	'fix',
	'refactor',
	'perf',
	'docs',
	'test',
	'chore',
	'build',
	'ci',
	'style',
	'revert',
];

const CONVENTIONAL_COMMIT_RE = new RegExp(
	`^(${CONVENTIONAL_COMMIT_TYPES.join('|')})(\\([^)]+\\))?!?:\\s+\\S`,
	'u',
);

/** True when `message` starts with a recognised `type(scope)?!: ` prefix. */
export const isConventionalCommitMessage = (message: string): boolean =>
	CONVENTIONAL_COMMIT_RE.test(message);

const branchOf = (ref: string | undefined): string | undefined =>
	ref?.split('/').pop();

const isProtectedBranch = (
	branch: string | undefined,
	protectedBranches: readonly string[],
): boolean => branch !== undefined && protectedBranches.includes(branch);

export interface IGitCommitArgs {
	readonly message: string;
	readonly files?: readonly string[] | undefined;
	readonly amend?: boolean | undefined;
	/**
	 * Identity of the calling agent, used ONLY to guard `--amend` against
	 * clobbering another agent's commit. Optional because most callers
	 * never amend.
	 */
	readonly agent?: string | undefined;
}

/**
 * Pure handler behind the `${prefix}_commit` tool — exported separately
 * so tests can drive it directly without an MCP server. Validates the
 * Conventional Commit prefix and the `--amend` ownership guard, then
 * delegates the actual git mechanics to `commitAndPush`.
 */
export const runGitCommit = async (
	run: IGitRunner,
	args: IGitCommitArgs,
): Promise<IToolTextResult> => {
	const repo = await checkRepo(run);
	if (!repo.ok) return NOT_A_REPO(repo.reason);

	const message = args.message.trim();
	if (message.length === 0) {
		return toolError(
			'commit message must not be empty',
			'Pass a non-empty Conventional Commit message.',
		);
	}
	if (!isConventionalCommitMessage(message)) {
		return toolError(
			`commit message must start with a Conventional Commit prefix (${CONVENTIONAL_COMMIT_TYPES.join('|')}), optionally scoped and/or "!": got "${message}"`,
			'Prefix the message, e.g. "feat(git): add write tools".',
		);
	}

	const amend = args.amend === true;
	if (amend) {
		const lastAuthor = await gitLastCommitAuthor(run);
		const agent = args.agent;
		if (
			lastAuthor !== undefined &&
			agent !== undefined &&
			lastAuthor !== agent
		) {
			return toolError(
				`refusing --amend: last commit author "${lastAuthor}" does not match agent "${agent}"`,
				'Only amend a commit your own agent authored; create a new commit instead.',
			);
		}
	}

	const files = args.files ?? [];
	const result = await commitAndPush({
		message,
		amend,
		git: run,
		...(files.length > 0
			? { files }
			: // No explicit files: assume the caller already staged what
				// it wants (e.g. via `git add` outside this tool, or
				// amending with no new changes) — never fall back to
				// `git add .`.
				{ skipAdd: true }),
	});

	if (!result.committed) {
		return toolError(
			result.reason ?? 'commit failed',
			'Check there are staged/changed files and the message is valid.',
		);
	}
	return toolOk({
		committed: true,
		...(result.hash !== undefined ? { hash: result.hash } : {}),
	});
};

export interface IGitPushArgs {
	readonly remote?: string | undefined;
	readonly branch?: string | undefined;
	readonly force?: 'with-lease' | 'true' | 'false' | undefined;
}

/**
 * Pure handler behind the `${prefix}_push` tool — exported separately so
 * tests can drive it directly without an MCP server.
 */
export const runGitPush = async (
	run: IGitRunner,
	args: IGitPushArgs,
	protectedBranches: readonly string[] = DEFAULT_PROTECTED_BRANCHES,
): Promise<IToolTextResult> => {
	const repo = await checkRepo(run);
	if (!repo.ok) return NOT_A_REPO(repo.reason);

	const targetBranch = branchOf(args.branch);
	if (isProtectedBranch(targetBranch, protectedBranches)) {
		return toolError(
			`refusing to push directly to protected branch "${targetBranch}"`,
			'Push to a feature/agent branch and open a PR instead.',
		);
	}

	const pushResult = await run([
		'push',
		...(args.remote !== undefined ? [args.remote] : []),
		...(args.branch !== undefined ? [args.branch] : []),
		...(args.force === 'with-lease'
			? ['--force-with-lease']
			: args.force === 'true'
				? ['--force']
				: []),
	]);
	if (!pushResult.ok) {
		return toolError(
			pushResult.reason ?? 'git push failed',
			'Check the remote/branch exist and you have permission to push.',
		);
	}
	return toolOk({ pushed: true });
};

/**
 * Read-only git orientation lives in `tools.ts`; this builder adds the
 * two write tools. Both declare `effects: ['write']` so a host can warn
 * on / gate them via `overview`.
 */
export const buildGitWriteToolRegistrations = (
	options: IGitWriteToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const protectedBranches =
		options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES;

	return [
		{
			id: 'commit',
			summary:
				'Stage and commit files with a Conventional Commit message.',
			tags: ['git', 'write'],
			effects: ['write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_commit`,
					{
						description:
							'Stages `files` (or everything already staged when omitted) and creates a commit. `message` MUST start with a Conventional Commit prefix (feat/fix/refactor/perf/docs/test/chore/build/ci/style/revert, optionally scoped and/or `!`). `amend: true` rewrites the last commit — refused unless the last commit author matches `agent`. Write effect.',
						inputSchema: z.object({
							message: z.string(),
							files: z.array(z.string()).optional(),
							amend: z.boolean().optional(),
							agent: z.string().optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							committed: z.boolean(),
							hash: z.string().optional(),
						}),
					},
					async (args: IGitCommitArgs) =>
						runGitCommit(options.run, args),
				);
			},
		},
		{
			id: 'push',
			summary:
				'Push the current branch, optionally with --force-with-lease.',
			tags: ['git', 'write'],
			effects: ['write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_push`,
					{
						description:
							'Pushes to `remote`/`branch` (defaults to the current branch\'s upstream). `force: "with-lease"` uses `--force-with-lease` (safe: fails if the remote moved); `force: "true"` uses plain `--force` (only when explicitly requested — never the default). Refuses to push directly to a protected branch (main/master). Write effect.',
						inputSchema: z.object({
							remote: z.string().optional(),
							branch: z.string().optional(),
							force: z
								.enum(['with-lease', 'true', 'false'])
								.optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							pushed: z.boolean(),
						}),
					},
					async (args: IGitPushArgs) =>
						runGitPush(options.run, args, protectedBranches),
				);
			},
		},
	];
};
