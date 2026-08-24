import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { redactSecrets, toolError, toolOk } from '@mcp-vertex/core/public';

import {
	createCompletionStore,
	type ICompletionRecord,
} from '../completion-store.service';
import { safeSendLoggingMessage } from '../safe-logging.helper';

export interface ICompletionToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the durable records directory. */
	readonly recordsDir: string;
	/** Fallback agent identity when the caller does not pass `agent`. */
	readonly defaultAgent?: string;
}

const recordSchema = z.object({
	taskId: z.string(),
	agent: z.string(),
	summary: z.string(),
	reviewEvidence: z.string(),
	ts: z.string(),
});

const pushNotification = (
	server: McpServer,
	namespacePrefix: string,
	record: ICompletionRecord,
): void => {
	safeSendLoggingMessage(server, {
		level: 'info',
		logger: `${namespacePrefix}_completion`,
		data: { event: 'agent-complete', ...record },
	});
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * `<prefix>_report_complete` — the agent declares its original task fully
 * done + reviewed. The declaration is redacted, stored durably (one file
 * per taskId) and pushed as an MCP notification so the human knows the
 * agent is now idle and will continue only when explicitly told.
 */
export const buildReportCompleteRegistration = (
	options: ICompletionToolOptions,
): IToolRegistration => {
	const store = createCompletionStore(options.recordsDir);
	return {
		id: 'report_complete',
		summary:
			'Declare the original task fully done and reviewed; records it durably and pushes a notification so the human knows the agent is idle awaiting explicit instruction.',
		tags: ['coordination', 'notification'],
		effects: ['write'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_report_complete`,
				{
					description:
						'Declare that an agent finished its ORIGINAL task, reviewed it thoroughly, and will take no further action unless the human explicitly asks. Persists a durable record (one per taskId) and pushes an MCP notification { event: "agent-complete", taskId, agent, summary, reviewEvidence, ts }. `reviewEvidence` is required — name what was actually verified (tests run, diff inspected, peer review) so "done" is a claim with proof, not a bare flag.',
					inputSchema: z
						.object({
							taskId: z.string().min(1),
							summary: z.string().min(1),
							reviewEvidence: z.string().min(1),
							agent: z.string().min(1).optional(),
						})
						.strict(),
					outputSchema: z.object({
						ok: z.boolean(),
						record: recordSchema,
					}),
				},
				async (args: {
					taskId: string;
					summary: string;
					reviewEvidence: string;
					agent?: string | undefined;
				}) => {
					try {
						const agent =
							args.agent?.trim() ||
							options.defaultAgent ||
							'unknown';
						const record: ICompletionRecord = {
							taskId: args.taskId,
							agent,
							summary: redactSecrets(args.summary).text,
							reviewEvidence: redactSecrets(args.reviewEvidence)
								.text,
							ts: new Date().toISOString(),
						};
						const stored = await store.upsert(record);
						pushNotification(
							server,
							options.namespacePrefix,
							stored,
						);
						return toolOk({ record: stored });
					} catch (error) {
						return toolError(
							errorMessage(error),
							'Retry the report once; if it keeps failing, check the completion records dir permissions.',
						);
					}
				},
			);
		},
	};
};

/**
 * `<prefix>_status` — read-only list of durable completion records
 * (which agents declared their original task done + reviewed).
 */
export const buildStatusRegistration = (
	options: ICompletionToolOptions,
): IToolRegistration => {
	const store = createCompletionStore(options.recordsDir);
	return {
		id: 'status',
		summary:
			'List durable task-completion records (agents that declared their original task done + reviewed and are idle).',
		tags: ['coordination', 'lazy'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_status`,
				{
					description:
						'List durable task-completion records: agents that declared their original task done and reviewed and will continue only when explicitly told. Optionally filter by `taskId` or `agent`. Read-only; records are ordered newest first.',
					inputSchema: z
						.object({
							taskId: z.string().min(1).optional(),
							agent: z.string().min(1).optional(),
						})
						.strict(),
					outputSchema: z.object({
						ok: z.boolean(),
						records: z.array(recordSchema),
					}),
				},
				async (args: {
					taskId?: string | undefined;
					agent?: string | undefined;
				}) => {
					try {
						const records = await store.list({
							...(args.taskId !== undefined
								? { taskId: args.taskId }
								: {}),
							...(args.agent !== undefined
								? { agent: args.agent }
								: {}),
						});
						return toolOk({ records });
					} catch (error) {
						return toolError(
							errorMessage(error),
							'Check the completion records dir permissions.',
						);
					}
				},
			);
		},
	};
};

/**
 * `<prefix>_clear` — the operator acknowledges a completion and removes
 * the record from the idle list.
 */
export const buildClearRegistration = (
	options: ICompletionToolOptions,
): IToolRegistration => {
	const store = createCompletionStore(options.recordsDir);
	return {
		id: 'clear',
		summary:
			'Delete a task-completion record by taskId (the operator acknowledges the completion and clears it from the idle list).',
		tags: ['coordination'],
		effects: ['write', 'destructive'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_clear`,
				{
					description:
						'Delete a task-completion record by `taskId`. Use after the human has acknowledged the completion; the record leaves the idle list returned by `<prefix>_status`. Removing an unknown taskId is a no-op (cleared: false).',
					inputSchema: z
						.object({ taskId: z.string().min(1) })
						.strict(),
					outputSchema: z.object({
						ok: z.boolean(),
						cleared: z.boolean(),
						taskId: z.string(),
					}),
				},
				async (args: { taskId: string }) => {
					try {
						const cleared = await store.remove(args.taskId);
						return toolOk({ cleared, taskId: args.taskId });
					} catch (error) {
						return toolError(
							errorMessage(error),
							'Check the completion records dir permissions.',
						);
					}
				},
			);
		},
	};
};
