import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import {
	computeReleaseHealth,
	groupRecordsByTrace,
	realReadReleaseHealthDeps,
	realReadTracesDeps,
	summarizeReleaseHealth,
	summarizeTraceGroups,
	type IReadReleaseHealthDeps,
	type IReadTracesDeps,
} from '../traces';

export interface IObsHealthToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs?: string;
	readonly tracesDeps?: IReadTracesDeps;
	readonly releaseHealthDeps?: IReadReleaseHealthDeps;
}

const SEVERITY = z.enum(['critical', 'high', 'medium', 'low', 'info']);

const COUNTS = z.object({
	critical: z.number().int().nonnegative(),
	high: z.number().int().nonnegative(),
	medium: z.number().int().nonnegative(),
	low: z.number().int().nonnegative(),
	info: z.number().int().nonnegative(),
});

const TRACE_INPUT = z
	.object({
		limit: z.number().int().min(1).max(1000).default(200),
		service: z.string().min(1).max(200).optional(),
	})
	.strict();

const TRACE_OUTPUT = z.object({
	sampleSize: z.number().int().nonnegative(),
	groups: z.array(
		z.object({
			service: z.string(),
			traceId: z.string(),
			hourBucket: z.string(),
			count: z.number().int().positive(),
			errorRate: z.number().min(0).max(1),
			topError: z.string().nullable(),
		}),
	),
	summary: COUNTS,
	worst: SEVERITY.nullable(),
});

const RELEASE_INPUT = z
	.object({
		limit: z.number().int().min(1).max(5000).default(1000),
		version: z.string().min(1).max(200).optional(),
	})
	.strict();

const RELEASE_OUTPUT = z.object({
	versions: z.array(
		z.object({
			version: z.string(),
			totalSessions: z.number().int().nonnegative(),
			crashCount: z.number().int().nonnegative(),
			crashFreeRate: z.number().min(0).max(1),
		}),
	),
	summary: COUNTS,
	worst: SEVERITY.nullable(),
});

const missingDepsError = (toolName: string) =>
	toolError(
		`${toolName} is not configured with a workspace reader.`,
		'Pass `workspaceRootAbs` when building the observability health tools, or inject `tracesDeps` / `releaseHealthDeps` in tests and alternate hosts.',
	);

const tracesDepsFor = (
	options: IObsHealthToolOptions,
): IReadTracesDeps | undefined => {
	if (options.tracesDeps !== undefined) return options.tracesDeps;
	if (options.workspaceRootAbs === undefined) return undefined;
	return realReadTracesDeps(options.workspaceRootAbs);
};

const releaseDepsFor = (
	options: IObsHealthToolOptions,
): IReadReleaseHealthDeps | undefined => {
	if (options.releaseHealthDeps !== undefined)
		return options.releaseHealthDeps;
	if (options.workspaceRootAbs === undefined) return undefined;
	return realReadReleaseHealthDeps(options.workspaceRootAbs);
};

export const buildObsHealthToolRegistration = (
	options: IObsHealthToolOptions,
): IToolRegistration => ({
	id: 'obs_health',
	tags: ['observability'],
	summary:
		'Summarize local trace groups and release crash-free rates from observability logs.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_obs_trace`,
			{
				description:
					'Read recent normalized trace/error records from local observability JSONL streams, group them by service/trace/hour, and report error-rate severity bands.',
				inputSchema: TRACE_INPUT,
				outputSchema: TRACE_OUTPUT,
			},
			async (args: z.infer<typeof TRACE_INPUT>) => {
				const deps = tracesDepsFor(options);
				if (deps === undefined) return missingDepsError('obs_trace');
				try {
					const records = await deps.listTraceRecords({
						limit: args.limit,
						...(args.service !== undefined
							? { service: args.service }
							: {}),
					});
					const groups = groupRecordsByTrace(records);
					const severity = summarizeTraceGroups(groups);
					return toolJson({
						sampleSize: records.length,
						groups,
						summary: severity.summary,
						worst: severity.worst,
					});
				} catch (error) {
					return toolError((error as Error).message);
				}
			},
		);

		server.registerTool(
			`${options.namespacePrefix}_obs_release_health`,
			{
				description:
					'Read release-adoption telemetry from local observability JSONL streams and compute per-version crash-free rates with normalized severity bands.',
				inputSchema: RELEASE_INPUT,
				outputSchema: RELEASE_OUTPUT,
			},
			async (args: z.infer<typeof RELEASE_INPUT>) => {
				const deps = releaseDepsFor(options);
				if (deps === undefined) {
					return missingDepsError('obs_release_health');
				}
				try {
					const records = await deps.listReleaseHealthRecords({
						limit: args.limit,
						...(args.version !== undefined
							? { version: args.version }
							: {}),
					});
					const versions = computeReleaseHealth(records);
					const severity = summarizeReleaseHealth(versions);
					return toolJson({
						versions,
						summary: severity.summary,
						worst: severity.worst,
					});
				} catch (error) {
					return toolError((error as Error).message);
				}
			},
		);
	},
});
