import {
	definePlugin,
	joinRel,
	resolveWorkspaceContained,
} from '@delendai/core/public';
import z from 'zod';

import {
	buildClearRegistration,
	buildReportCompleteRegistration,
	buildStatusRegistration,
} from './lib/tools/completion-tools';

/**
 * `@delendai/completion` — task-completion notifier.
 *
 * Fills the gap between "an agent says it is done" and "the human is
 * told". The agent declares its ORIGINAL task complete + thoroughly
 * reviewed with `<prefix>_report_complete`; the plugin redacts and
 * persists the declaration (one file per taskId) and pushes an MCP
 * `notifications/message` `{ event: "agent-complete", … }` so the
 * operator knows the agent is idle and will continue only when
 * explicitly asked. `<prefix>_status` lists the durable records and
 * `<prefix>_clear` lets the operator acknowledge and dismiss one.
 *
 *   delendai --plugins=completion
 *
 * The default records dir is the plugin cache (`<cacheDir>/completion/
 * records`); override with the `recordsDir` option. Unlike the
 * `notification` plugin's lock watcher, the push happens directly in
 * the reporting handler (the declaring agent and the notified human
 * share the same MCP server), so no cross-process file watch is needed.
 */
export default definePlugin({
	name: 'completion',
	version: '0.1.0',
	describe:
		'Records an agent declaring its original task done + reviewed and pushes a notification so the human knows the agent is idle awaiting explicit instruction.',
	optionsSchema: z.object({
		/** Workspace-relative records directory. Default `<cacheDir>/completion/records`. */
		recordsDir: z.string().optional(),
	}),
	register(ctx) {
		const recordsRel =
			typeof ctx.options.recordsDir === 'string'
				? (ctx.options.recordsDir as string)
				: joinRel(ctx.pluginCacheDir, 'records');
		const resolved = resolveWorkspaceContained(
			ctx.workspace.root,
			recordsRel,
		);
		if (!resolved.ok) {
			throw new Error(
				`completion: invalid recordsDir: ${resolved.reason ?? recordsRel}`,
			);
		}

		const defaultAgent = ctx.hostIdentity?.model ?? ctx.hostIdentity?.host;
		const toolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			recordsDir: resolved.abs,
			...(defaultAgent !== undefined ? { defaultAgent } : {}),
		};

		return {
			tools: [
				buildReportCompleteRegistration(toolOptions),
				buildStatusRegistration(toolOptions),
				buildClearRegistration(toolOptions),
			],
			knowledge: [
				{
					id: 'task-completion',
					title: 'Task-completion notifications',
					body: [
						'# Task-completion notifications',
						'',
						'With `--plugins=completion`, an agent that finished its ORIGINAL',
						'task, reviewed it thoroughly, and will continue only when',
						'explicitly told declares it via `<prefix>_report_complete`:',
						'',
						'```json',
						'{ "taskId": "f00100-s1", "summary": "…", "reviewEvidence": "tests green + diff reviewed" }',
						'```',
						'',
						'The declaration is redacted, stored durably (one file per',
						'taskId) and pushed as an MCP notification',
						'`{ "event": "agent-complete", taskId, agent, summary, reviewEvidence, ts }`.',
						'',
						'`reviewEvidence` is REQUIRED — "done" must be a claim with',
						'proof (tests run, diff inspected, peer review), not a bare flag.',
						'',
						'- `<prefix>_status` lists every durable completion record.',
						'- `<prefix>_clear { taskId }` acknowledges and removes one.',
						'',
						'Call `report_complete` only when the original task is finished;',
						'it signals the agent has nothing left to do unless the human',
						'asks. Do NOT call it mid-task or between slices of the same task.',
					].join('\n'),
				},
			],
		};
	},
});
