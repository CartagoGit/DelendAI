/**
 * invoke.tool.ts — `<prefix>_invoke` (Option E core, f00067 S6).
 *
 * The game-changer: the orchestrator hands a task, the runner EXECUTES it on
 * the best provider (with fallback), and returns the structured result. All
 * the safety (CRITICAL I5), fallback (I7) and cancellation (I8) logic lives
 * in {@link InvocationManager}; this tool is a thin, validated shell around
 * it. It NEVER spends without a signed confirmation token.
 */
import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';
import { z } from 'zod';

import type { InvocationManager } from '../invoke/manager';
import { CapabilityTagSchema, InvokeOutputSchema } from '../schemas';

export interface IInvokeToolOptions {
	readonly namespacePrefix: string;
	readonly manager: InvocationManager;
}

const InputSchema = z.object({
	task: z.string().min(1),
	mode: z.enum(['plan', 'explore', 'implement', 'review']).optional(),
	capabilityHints: z.array(CapabilityTagSchema).optional(),
	costPreference: z.enum(['minimize', 'balanced', 'maximize']).optional(),
	sessionId: z.string().min(1).optional(),
	stream: z.boolean().optional(),
	toolsAllow: z.array(z.string()).optional(),
	timeoutMs: z.number().int().min(1).optional(),
	fallbackStrategy: z.enum(['rerank', 'tier-down']).optional(),
});

export const buildInvokeRegistration = (
	options: IInvokeToolOptions,
): IToolRegistration => ({
	id: 'invoke',
	tags: ['orchestrator-runner', 'lazy', 'invoke', 'spend'],
	summary:
		'Execute a task on the best provider (with fallback). Gated by executeApi + a signed confirmation token — never spends silently.',
	descriptionKey: 'mcp-vertex_orchestrator-runner_invoke',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_invoke`,
			{
				description:
					"Execute a task on the best-scored provider and return its structured result. Plans a fallback chain (rerank|tier-down), enforces a wall-clock timeout that fires the per-kind cancellation ladder, and — CRITICAL SAFETY — never spends the user's API money unless executeApi is on AND a one-time signed confirmation token (from an MCP elicitation) authorises THAT invocation. With executeApi:false, api/cli routes return an 'execution-disabled' error and a handoff instead of spending. Returns {decision, result{text, structuredContent?, usage?, costUsd?}, invocationId, sessionId} on success, or {decision, error{code, tried, nextAvailableAt}, userMessage} otherwise.",
				inputSchema: InputSchema,
				outputSchema: InvokeOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const output = await options.manager.invoke({
					task: args.task,
					...(args.mode !== undefined ? { mode: args.mode } : {}),
					...(args.capabilityHints !== undefined
						? { capabilityHints: args.capabilityHints }
						: {}),
					...(args.costPreference !== undefined
						? { costPreference: args.costPreference }
						: {}),
					...(args.sessionId !== undefined
						? { sessionId: args.sessionId }
						: {}),
					...(args.stream !== undefined
						? { stream: args.stream }
						: {}),
					...(args.toolsAllow !== undefined
						? { toolsAllow: args.toolsAllow }
						: {}),
					...(args.timeoutMs !== undefined
						? { timeoutMs: args.timeoutMs }
						: {}),
					...(args.fallbackStrategy !== undefined
						? { fallbackStrategy: args.fallbackStrategy }
						: {}),
				});
				return toolJson(output);
			},
		);
	},
});
