/**
 * f00129 S1 — `obs_errors` tool.
 *
 * Pure planner over an injected `IErrorSource`. Returns the
 * normalized `IObsIssue[]` for the host's CLI/extension renderer.
 * When the source is absent or its token is empty, the tool returns
 * an actionable install hint rather than crashing — same fail-soft
 * contract the other plugins in this monorepo use.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	listRecentErrors,
	type IListErrorsInput,
	type IListErrorsOutput,
} from '../errors/list-errors';
import type { IErrorSource, IObsIssue } from '../errors/ierror-source';

export interface IObsErrorsToolOptions {
	readonly namespacePrefix: string;
	readonly source?: IErrorSource;
}

const INPUT = z
	.object({
		project: z.string().min(1).max(200).optional(),
		level: z
			.enum(['fatal', 'error', 'warning', 'info', 'debug'])
			.optional(),
		cursor: z.string().min(1).max(2000).optional(),
		limit: z.number().int().min(1).max(100).default(25),
	})
	.strict();

const ISSUE_OUTPUT = z.object({
	id: z.string(),
	title: z.string(),
	project: z.string(),
	level: z.enum(['fatal', 'error', 'warning', 'info', 'debug', 'unknown']),
	lastSeen: z.string(),
	eventCount: z.number(),
	context: z.string(),
	url: z.string(),
});

const OUTPUT = z.object({
	source: z.enum(['sentry', 'datadog', 'custom']),
	issues: z.array(ISSUE_OUTPUT),
	nextCursor: z.string().nullable(),
	redactions: z.number(),
});

const installHint = (reason: string): ReturnType<typeof toolError> =>
	toolError(
		reason,
		'Configure an observability source (Sentry/Datadog) by setting the SENTRY_AUTH_TOKEN or DATADOG_API_KEY env var, or pass `source` to the plugin options. The plugin never bundles vendor SDKs; auth is env-only and never logged.',
	);

/** `obs_errors` tool registration. */
export const buildObsErrorsToolRegistration = (
	options: IObsErrorsToolOptions,
): IToolRegistration => ({
	id: 'obs_errors',
	tags: ['observability', 'network', 'effects'],
	summary: 'List recent issues from a Sentry/Datadog source via web-fetch.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_obs_errors`,
			{
				description:
					'List recent issues from the configured observability source (Sentry/Datadog) via the allow-listed web-fetch engine. Returns the vendor-agnostic `IObsIssue[]`. Auth is env-only and never logged; without a configured source or token the tool returns an actionable hint, never a crash. Filter by `project` and/or `level` to narrow the page; `cursor` is a passthrough for paginated vendors.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				if (options.source === undefined) {
					return installHint(
						'No observability source is configured.',
					);
				}
				if (options.source.token.length === 0) {
					return installHint(
						`${options.source.id.toUpperCase()} auth token is empty.`,
					);
				}
				const input: IListErrorsInput = {
					limit: args.limit,
					...(args.project !== undefined
						? { project: args.project }
						: {}),
					...(args.level !== undefined
						? { level: args.level as IObsIssue['level'] }
						: {}),
					...(args.cursor !== undefined
						? { cursor: args.cursor }
						: {}),
				};
				try {
					const result: IListErrorsOutput = await listRecentErrors(
						options.source,
						input,
					);
					return toolJson(result);
				} catch (error) {
					return toolError((error as Error).message);
				}
			},
		);
	},
});
