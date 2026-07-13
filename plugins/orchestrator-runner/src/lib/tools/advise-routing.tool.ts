/**
 * advise-routing.tool.ts — `<prefix>_advise_routing`.
 *
 * The headless routing brain: given a task description + capability hints,
 * it scores the confirmed roster against the in-memory availability mirror
 * and returns the winning `IRoutingDecision` plus the top-2 backups and the
 * full scoring trace. It NEVER spawns or spends — it advises (S6 executes).
 *
 * Session stickiness (CRITICAL I12): a caller that passes `sessionId` gets
 * the same decision back until the TTL elapses. A generated id is returned
 * when the caller omits one so a follow-up call can opt into stickiness.
 *
 * Loop annotation reuses the injected loop detector (never a new one): when
 * the same session keeps asking for the same route the decision is tagged
 * with a `loopWarning` sourced from the detector's `isAgentStuck`.
 */
import { randomUUID } from 'node:crypto';

import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';
import type { IProviderCapabilities } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildRoutingDecision } from '../router/advise';
import type { SessionStore } from '../router/session';
import type { HealthStore } from '../healthcheck/store';
import type { CostPreference, ILoopDetectionSeam } from '../types';
import { AdviseRoutingOutputSchema, CapabilityTagSchema } from '../schemas';

export interface IAdviseRoutingToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly sessions: SessionStore;
	readonly defaultCostPreference: CostPreference;
	readonly loopDetector?: ILoopDetectionSeam | undefined;
}

const InputSchema = z.object({
	taskDescription: z.string().min(1),
	sliceCapabilityHints: z.array(CapabilityTagSchema).optional(),
	mode: z.enum(['plan', 'explore', 'implement', 'review']).optional(),
	costPreference: z.enum(['minimize', 'balanced', 'maximize']).optional(),
	sessionId: z.string().min(1).optional(),
});

export const buildAdviseRoutingRegistration = (
	options: IAdviseRoutingToolOptions,
): IToolRegistration => ({
	id: 'advise_routing',
	tags: ['orchestrator-runner', 'lazy', 'routing'],
	summary:
		'Score the provider roster for a task and advise which provider to route to (no spend).',
	descriptionKey: 'mcp-vertex_orchestrator-runner_advise_routing',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_advise_routing`,
			{
				description:
					"Advise which model provider to route a task to. Scores the confirmed roster against the task's capability hints, mode and cost preference, penalising providers the healthcheck marks unavailable, and returns the winning decision (strategy passthrough|api|cli|mcp-tool|handoff), the top-2 backups and a transparent scoring trace. Headless: it never spawns a subprocess or spends money. Pass a sessionId for sticky routing across a multi-step task.",
				inputSchema: InputSchema,
				outputSchema: AdviseRoutingOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const sessionId = args.sessionId ?? `sess_${randomUUID()}`;
				const mode = args.mode ?? 'implement';
				const costPref =
					args.costPreference ?? options.defaultCostPreference;

				// Session stickiness: an existing, non-expired decision wins.
				const sticky = options.sessions.get(sessionId);
				const decision =
					sticky ??
					buildRoutingDecision({
						providers: options.providers,
						availabilityOf: (id) => options.health.get(id),
						hint: {
							mode,
							capabilities: args.sliceCapabilityHints ?? [],
							costPref,
						},
						prompt: args.taskDescription,
						sessionId,
					});
				if (sticky === undefined) {
					options.sessions.set(sessionId, decision);
				}

				const warning =
					options.loopDetector?.isAgentStuck('advise_routing', {
						agent: sessionId,
						taskDescription: args.taskDescription,
					}) ?? null;

				return toolJson({
					decision,
					alternates: decision.alternates,
					scoringTrace: decision.scoringTrace,
					sessionId,
					...(warning !== null ? { loopWarning: warning } : {}),
				});
			},
		);
	},
});
