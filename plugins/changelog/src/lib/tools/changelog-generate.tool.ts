import { execFile } from 'node:child_process';

import z from 'zod';

import type {
	IGitRunner,
	IGitRunResult,
	IToolRegistration,
} from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	groupByType,
	parseConventionalCommit,
	renderMarkdown,
	type IChangelogSection,
	type IConventionalCommit,
} from '../render';

export interface IChangelogGenerateToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly gitRunner?: IGitRunner;
	readonly logParser?: (raw: string) => readonly IConventionalCommit[];
}

const INPUT = z
	.object({
		range: z.string(),
		from: z.string().optional(),
		to: z.string().optional(),
	})
	.strict();

const COMMIT_OUTPUT = z.object({
	type: z.enum([
		'feat',
		'fix',
		'docs',
		'refactor',
		'perf',
		'test',
		'build',
		'ci',
		'chore',
		'style',
		'revert',
		'breaking',
		'other',
	]),
	scope: z.string().optional(),
	subject: z.string(),
	body: z.string().optional(),
	breaking: z.boolean(),
	hash: z.string(),
});

const SECTION_OUTPUT = z.object({
	type: COMMIT_OUTPUT.shape.type,
	commits: z.array(COMMIT_OUTPUT),
});

const SUCCESS_OUTPUT = z.object({
	ok: z.literal(true),
	markdown: z.string(),
	sections: z.array(SECTION_OUTPUT),
	commitCount: z.number().int().min(0),
});

const ERROR_OUTPUT = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.enum(['empty-range', 'git-failed']),
		nextAction: z.string().optional(),
	}),
});

const OUTPUT = z.union([SUCCESS_OUTPUT, ERROR_OUTPUT]);

const createDefaultGitRunner =
	(cwd: string, timeoutMs = 15_000): IGitRunner =>
	(args) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					timeout: timeoutMs,
					maxBuffer: 8 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ ok: true, output: stdout });
						return;
					}
					const err = error as NodeJS.ErrnoException & {
						killed?: boolean;
						signal?: string;
					};
					let reason: string;
					if (err.code === 'ENOENT') {
						reason = 'git is not installed or not on PATH';
					} else if (err.killed || err.signal === 'SIGTERM') {
						reason = `git timed out after ${timeoutMs}ms`;
					} else {
						reason =
							(stderr || err.message || 'git command failed')
								.trim()
								.split('\n')[0] ?? 'git command failed';
					}
					resolve({ ok: false, output: '', reason });
				},
			);
		});

const normalizeRangeToken = (value?: string): string | undefined => {
	const normalized = value?.trim();
	return normalized !== undefined && normalized.length > 0
		? normalized
		: undefined;
};

export const resolveRequestedRange = (input: z.infer<typeof INPUT>): string => {
	const from = normalizeRangeToken(input.from);
	const to = normalizeRangeToken(input.to);
	if (from !== undefined && to !== undefined) return `${from}..${to}`;
	if (from !== undefined) return `${from}..HEAD`;
	if (to !== undefined) return `HEAD..${to}`;
	return input.range.trim();
};

export const parseGitLogOutput = (
	raw: string,
): readonly IConventionalCommit[] =>
	raw
		.split('\u001e')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.flatMap((entry) => {
			const parsed = parseConventionalCommit(entry);
			return parsed === null ? [] : [parsed];
		});

const emptyRangeEnvelope = (range: string) =>
	toolJson({
		ok: false,
		error: {
			reason: 'empty-range' as const,
			nextAction:
				range.length === 0
					? 'Provide a non-empty git range, or pass `from` and `to`.'
					: 'No commits matched that range. Adjust `range`, `from`, or `to`.',
		},
	});

const gitFailedEnvelope = (reason: string) =>
	toolJson({
		ok: false,
		error: {
			reason: 'git-failed' as const,
			nextAction: reason,
		},
	});

export const buildChangelogGenerateToolRegistration = (
	options: IChangelogGenerateToolOptions,
): IToolRegistration => ({
	id: 'changelog_generate',
	summary:
		'Generate a markdown changelog from a git commit range using conventional commit grouping.',
	tags: ['changelog', 'git', 'release'],
	effects: [],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_changelog_generate`,
			{
				description:
					'Generate a markdown changelog for a git revision range by parsing conventional commits, grouping them by type, and rendering deterministic markdown. Pure over injected git/log dependencies in tests; empty or unmatched ranges return a typed envelope instead of throwing.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				const range = resolveRequestedRange(args);
				if (range.length === 0) return emptyRangeEnvelope(range);
				const gitRunner =
					options.gitRunner ??
					createDefaultGitRunner(options.workspaceRootAbs);
				const result = await gitRunner([
					'log',
					range,
					'--pretty=format:%h %s%n%b%x1e',
				]);
				if (!result.ok) {
					return gitFailedEnvelope(result.reason ?? 'git log failed');
				}
				const commits = (options.logParser ?? parseGitLogOutput)(
					result.output,
				);
				if (commits.length === 0) return emptyRangeEnvelope(range);
				const sections: readonly IChangelogSection[] =
					groupByType(commits);
				return toolJson({
					ok: true,
					markdown: renderMarkdown(sections),
					sections,
					commitCount: commits.length,
				});
			},
		);
	},
});
