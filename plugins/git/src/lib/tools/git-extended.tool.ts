import z from 'zod';

import type { IArgvExec, IToolRegistration } from '@delendai/core/public';
import { runExternalTool, toolError, toolJson } from '@delendai/core/public';

const GIT_TOOL = {
	id: 'git',
	bin: 'git',
	installHints: [{ manager: 'apt', command: 'sudo apt install git' }],
} as const;

const GH_TOOL = {
	id: 'gh',
	bin: 'gh',
	installHints: [
		{ manager: 'brew', command: 'brew install gh' },
		{ manager: 'apt', command: 'sudo apt install gh' },
	],
} as const;

const GH_MISSING_HINT = 'gh CLI not found; install gh or use git directly';

const commandResultSchema = z.object({
	stdout: z.string(),
	stderr: z.string(),
});

// Output schema is a single object (not a union) so the MCP SDK's
// `normalizeObjectSchema` keeps the `outputSchema` on the wire. The shape
// is a tagged union (`ok: true | 'skipped'`) collapsed into one object
// with optional fields — callers still get a typed discriminated
// payload (parsed against the original union at the call site if
// needed). The MCP SDK's strict `outputSchema` validator runs after
// the handler returns; collapsing to one object lets it pass.
const gitActionOutputSchema = z.object({
	ok: z.union([z.literal(true), z.literal('skipped')]),
	action: z.string().optional(),
	result: z
		.union([
			z.record(z.string(), z.unknown()),
			z.array(z.record(z.string(), z.unknown())),
			commandResultSchema,
		])
		.optional(),
	hint: z.string().optional(),
});

const gitPrArgsSchema = z
	.object({
		action: z.enum(['create', 'view', 'list']),
		title: z.string().optional(),
		body: z.string().optional(),
		base: z.string().optional(),
		draft: z.boolean().optional(),
		prNumber: z.number().int().positive().optional(),
	})
	.superRefine((value, ctx) => {
		if (
			value.action === 'create' &&
			(value.title === undefined || value.body === undefined)
		) {
			if (value.title === undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'title is required for action=create',
					path: ['title'],
				});
			}
			if (value.body === undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'body is required for action=create',
					path: ['body'],
				});
			}
		}
	});

const gitBisectArgsSchema = z
	.object({
		action: z.enum(['start', 'good', 'bad', 'reset', 'log']),
		badSha: z.string().optional(),
		goodSha: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.action === 'start') {
			if (value.badSha === undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'badSha is required for action=start',
					path: ['badSha'],
				});
			}
			if (value.goodSha === undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'goodSha is required for action=start',
					path: ['goodSha'],
				});
			}
		}
	});

const gitStashArgsSchema = z.object({
	action: z.enum(['push', 'pop', 'list', 'drop']),
	message: z.string().optional(),
	stashRef: z.string().optional(),
});

export interface IGitExtendedToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly exec?: IArgvExec;
}

const nextActionFor = (tool: 'git' | 'gh'): string =>
	tool === 'gh'
		? 'Install gh and authenticate with `gh auth login`.'
		: 'Install git and run inside a git working tree.';

const asCommandResult = (
	stdout: string,
	stderr: string,
): { stdout: string; stderr: string } => ({ stdout, stderr });

const runTool = async (
	tool: typeof GIT_TOOL | typeof GH_TOOL,
	args: readonly string[],
	options: IGitExtendedToolOptions,
) =>
	runExternalTool(
		{
			tool,
			args,
			cwd: options.workspaceRootAbs,
			timeoutMs: 30_000,
			maxOutputBytes: 1024 * 1024,
		},
		options.exec,
	);

const parseJson = (text: string): unknown | undefined => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

const validationError = (message: string) =>
	toolError(message, 'Fix the tool input and retry.');

const encodeZodError = (error: z.ZodError): string =>
	error.issues.map((issue) => issue.message).join('; ');

const handleGitFailure = (reason: string): ReturnType<typeof toolError> =>
	toolError(reason, nextActionFor('git'));

const handleGhFailure = (reason: string): ReturnType<typeof toolError> =>
	toolError(reason, nextActionFor('gh'));

/**
 * f00136 S2 — opt-in git helpers beyond orientation: pull requests via gh,
 * git bisect control, and stash management. Additive: the existing read-only
 * status/log/diff surface stays unchanged.
 */
export const buildGitExtendedToolRegistrations = (
	options: IGitExtendedToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'pr',
			effects: ['network'],
			summary:
				'Create, view or list pull requests via gh when available.',
			tags: ['git', 'network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_pr`,
					{
						description:
							'Create, view or list pull requests via the gh CLI. Uses gh when present, otherwise returns a typed skipped result. Network effect is declared explicitly.',
						inputSchema: gitPrArgsSchema,
						outputSchema: gitActionOutputSchema,
					},
					async (rawArgs: unknown) => {
						const parsed = gitPrArgsSchema.safeParse(rawArgs);
						if (!parsed.success) {
							return validationError(
								encodeZodError(parsed.error),
							);
						}
						const args = parsed.data;
						const ghArgs =
							args.action === 'create'
								? [
										'pr',
										'create',
										'--title',
										args.title ?? '',
										'--body',
										args.body ?? '',
										...(args.base !== undefined
											? ['--base', args.base]
											: []),
										...(args.draft === true
											? ['--draft']
											: []),
									]
								: args.action === 'view'
									? [
											'pr',
											'view',
											...(args.prNumber !== undefined
												? [String(args.prNumber)]
												: []),
											'--json',
											'number,title,state,author,createdAt,url,isDraft,baseRefName,headRefName',
										]
									: [
											'pr',
											'list',
											'--json',
											'number,title,state,author,createdAt',
										];
						const run = await runTool(GH_TOOL, ghArgs, options);
						if (run.unavailable) {
							return toolJson({
								ok: 'skipped' as const,
								hint: GH_MISSING_HINT,
							});
						}
						if (!run.ok) {
							return handleGhFailure(
								run.stderr.trim() ||
									run.stdout.trim() ||
									`gh pr ${args.action} failed`,
							);
						}
						const parsedJson =
							args.action === 'create'
								? undefined
								: parseJson(run.stdout);
						return toolJson({
							ok: true as const,
							action: args.action,
							result:
								parsedJson !== undefined
									? parsedJson
									: asCommandResult(run.stdout, run.stderr),
						});
					},
				);
			},
		},
		{
			id: 'bisect',
			summary: 'Control an in-progress git bisect session.',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_bisect`,
					{
						description:
							'Run git bisect subcommands (`start`, `good`, `bad`, `reset`, `log`) and return stdout/stderr as structured JSON.',
						inputSchema: gitBisectArgsSchema,
						outputSchema: gitActionOutputSchema,
					},
					async (rawArgs: unknown) => {
						const parsed = gitBisectArgsSchema.safeParse(rawArgs);
						if (!parsed.success) {
							return validationError(
								encodeZodError(parsed.error),
							);
						}
						const args = parsed.data;
						const gitArgs =
							args.action === 'start'
								? [
										'bisect',
										'start',
										args.badSha ?? '',
										args.goodSha ?? '',
									]
								: ['bisect', args.action];
						const run = await runTool(GIT_TOOL, gitArgs, options);
						if (run.unavailable) {
							return handleGitFailure(
								'git is not installed or not on PATH',
							);
						}
						if (!run.ok) {
							return handleGitFailure(
								run.stderr.trim() ||
									run.stdout.trim() ||
									`git bisect ${args.action} failed`,
							);
						}
						return toolJson({
							ok: true as const,
							action: args.action,
							result: asCommandResult(run.stdout, run.stderr),
						});
					},
				);
			},
		},
		{
			id: 'stash',
			summary: 'List, push, pop or drop git stashes.',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_stash`,
					{
						description:
							'Run git stash subcommands (`push`, `pop`, `list`, `drop`) and return stdout/stderr as structured JSON.',
						inputSchema: gitStashArgsSchema,
						outputSchema: gitActionOutputSchema,
					},
					async (rawArgs: unknown) => {
						const parsed = gitStashArgsSchema.safeParse(rawArgs);
						if (!parsed.success) {
							return validationError(
								encodeZodError(parsed.error),
							);
						}
						const args = parsed.data;
						const gitArgs =
							args.action === 'push'
								? [
										'stash',
										'push',
										...(args.message !== undefined
											? ['-m', args.message]
											: []),
									]
								: [
										'stash',
										args.action,
										...(args.stashRef !== undefined
											? [args.stashRef]
											: []),
									];
						const run = await runTool(GIT_TOOL, gitArgs, options);
						if (run.unavailable) {
							return handleGitFailure(
								'git is not installed or not on PATH',
							);
						}
						if (!run.ok) {
							return handleGitFailure(
								run.stderr.trim() ||
									run.stdout.trim() ||
									`git stash ${args.action} failed`,
							);
						}
						return toolJson({
							ok: true as const,
							action: args.action,
							result: asCommandResult(run.stdout, run.stderr),
						});
					},
				);
			},
		},
	];
};
