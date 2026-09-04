import z from 'zod';

import {
	resolveWorkspaceContained,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';

import type { IQualityToolOptions } from './tools';
import { summarizeCoverage } from './coverage';

const argsSchema = z.object({
	cwd: z.string().optional(),
	scope: z.enum(['lines', 'branches', 'functions', 'all']).optional(),
});

const metricSchema = z.object({
	covered: z.number(),
	total: z.number(),
	pct: z.number(),
});

// Output schema is a single object (not a union) so the MCP SDK's
// `normalizeObjectSchema` keeps the `outputSchema` on the wire. The
// `ok: true | 'skipped'` discriminator is preserved; the success-only
// fields are optional so the same shape validates both the ok and the
// skipped paths. Callers can still narrow on `ok` at the call site.
const outputSchema = z.object({
	ok: z.union([z.literal(true), z.literal('skipped')]),
	scope: z.enum(['lines', 'branches', 'functions', 'all']).optional(),
	lines: metricSchema.optional(),
	branches: metricSchema.optional(),
	functions: metricSchema.optional(),
	hint: z.string().optional(),
});

const coveragePathFor = (
	workspaceRoot: string,
	cwd = '.',
): string | undefined => {
	const contained = resolveWorkspaceContained(workspaceRoot, cwd);
	if (!contained.ok) return undefined;
	return `${contained.rel === '.' ? '' : `${contained.rel}/`}.vitest/coverage/coverage-final.json`;
};

export const buildQualityCoverageToolRegistration = (
	options: IQualityToolOptions,
): IToolRegistration => ({
	id: 'coverage',
	summary: 'Summarise vitest coverage-final.json into compact metrics.',
	tags: ['quality', 'coverage'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_coverage`,
			{
				description:
					'Read `.vitest/coverage/coverage-final.json` under the requested cwd and return compact line/branch/function coverage metrics. Read-only.',
				inputSchema: argsSchema,
				outputSchema,
			},
			async (rawArgs: unknown) => {
				const parsed = argsSchema.safeParse(rawArgs);
				if (!parsed.success) {
					return toolError(
						parsed.error.issues
							.map((issue) => issue.message)
							.join('; '),
						'Fix the tool input and retry.',
					);
				}
				const scope = parsed.data.scope ?? 'all';
				const coveragePath = coveragePathFor(
					options.workspaceRoot,
					parsed.data.cwd,
				);
				if (coveragePath === undefined) {
					return toolError(
						'cwd must stay inside the workspace',
						'Pass a relative path inside the workspace.',
					);
				}
				const raw = await options.reader.readFile(coveragePath);
				if (raw === undefined) {
					return toolJson({
						ok: 'skipped' as const,
						hint: 'no coverage-final.json; run `bun run test:coverage` first',
					});
				}
				const summary = summarizeCoverage(raw);
				return toolJson({
					ok: true as const,
					scope,
					lines: summary.lines,
					...(scope === 'branches' || scope === 'all'
						? { branches: summary.branches }
						: {}),
					...(scope === 'functions' || scope === 'all'
						? { functions: summary.functions }
						: {}),
				});
			},
		);
	},
});
