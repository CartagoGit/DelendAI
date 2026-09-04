/**
 * cancel-invocation.tool.ts — `<prefix>_cancel_invocation` (f00067 S6).
 *
 * Cancels an in-flight `<prefix>_invoke` by id. The runner applies the
 * PER-KIND ladder (CRITICAL I8): `mcp-server` → JSON-RPC `$/cancelRequest`;
 * `cli` → SIGTERM then SIGKILL; `api` → `AbortController.abort`;
 * `subscription` → best-effort no-op. Cancelling an unknown/settled id is a
 * no-op that returns `cancelled:false` — never an error.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import type { InvocationManager } from '../invoke/manager';
import { CancelInvocationOutputSchema } from '../schemas';

export interface ICancelInvocationToolOptions {
	readonly namespacePrefix: string;
	readonly manager: InvocationManager;
}

const InputSchema = z.object({
	invocationId: z.string().min(1),
});

export const buildCancelInvocationRegistration = (
	options: ICancelInvocationToolOptions,
): IToolRegistration => ({
	id: 'cancel_invocation',
	tags: ['orchestrator-runner', 'lazy', 'invoke'],
	summary:
		'Cancel an in-flight invocation by id, applying the per-kind cancellation ladder.',
	descriptionKey: 'delendai_orchestrator-runner_cancel_invocation',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_cancel_invocation`,
			{
				description:
					'Cancel an in-flight invocation started by <prefix>_invoke. Applies the per-kind ladder: mcp-server sends JSON-RPC $/cancelRequest with the active id; cli sends SIGTERM then SIGKILL; api aborts the fetch (upstream spend is not refundable); subscription is best-effort. Cancelling an unknown or already-finished id returns {cancelled:false}, never an error.',
				inputSchema: InputSchema,
				outputSchema: CancelInvocationOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const { cancelled } = options.manager.cancel(args.invocationId);
				return toolJson({
					invocationId: args.invocationId,
					cancelled,
					note: cancelled
						? 'Cancellation signal sent to the active invocation.'
						: 'No in-flight invocation with that id (already finished or never started).',
				});
			},
		);
	},
});
