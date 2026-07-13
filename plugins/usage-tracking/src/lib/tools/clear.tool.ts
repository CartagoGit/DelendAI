/**
 * clear.tool.ts — `<prefix>_usage_clear`.
 *
 * Explicit, destructive user action: truncate the append-only log and the
 * derived summary. Requires `confirm: true` so an agent can never wipe the
 * user's usage history by accident. The truncate goes through the same
 * durable path as every write (mutex + atomic + redact of the empty body).
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

export interface IClearToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
	readonly summaryPath: string;
}

export const buildClearToolRegistration = (
	options: IClearToolOptions,
): IToolRegistration => ({
	id: 'usage_clear',
	effects: ['write', 'destructive'],
	tags: ['usage-tracking'],
	summary: 'Clear the recorded usage log + summary (requires confirmation).',
	descriptionKey: 'usage-tracking_usage_clear',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_usage_clear`,
			{
				description:
					'Clear the recorded usage history: truncates invocations.jsonl and usage-summary.json under the cache dir. Destructive and irreversible — you must pass confirm:true. Intended as an explicit user action, not something an agent does on its own.',
				inputSchema: z.object({
					confirm: z
						.boolean()
						.describe('Must be true to actually clear the log.'),
				}),
				outputSchema: z.object({
					ok: z.literal(true),
					cleared: z.array(z.string()),
				}),
			},
			async (args: { confirm: boolean }) => {
				if (args.confirm !== true) {
					return toolError(
						'usage_clear requires confirm:true',
						'This permanently deletes the recorded usage log and summary. Pass confirm:true to proceed.',
					);
				}
				await withFileMutex(options.invocationsPath, () =>
					writeFileAtomic(options.invocationsPath, ''),
				);
				await withFileMutex(options.summaryPath, () =>
					writeFileAtomic(options.summaryPath, ''),
				);
				return toolOk({
					cleared: [options.invocationsPath, options.summaryPath],
				});
			},
		);
	},
});
