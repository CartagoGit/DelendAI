/**
 * handoff-decision.interface.ts — the slice of `IRoutingDecision` that
 * `format_handoff` actually reads (see `formatHandoff` in
 * `../invoke/handoff.ts`): the invoke recipe, the prompt, the mode, the
 * target provider's id + model, and the cost tier for the note text.
 *
 * `IRoutingDecision` also carries `strategy`, `rationale`, `alternates`
 * (a recursive top-2-backups array embedding the full provider roster
 * schema) and `scoringTrace` — none of which `formatHandoff` touches.
 * Accepting only this narrower shape keeps the tool's advertised input
 * schema proportional to what it consumes; callers holding a full
 * `IRoutingDecision` (from `advise_routing` / `invoke`) still satisfy it
 * structurally, since extra properties on an object VALUE are allowed.
 */
import type {
	CostTier,
	IProviderInvoke,
	RoutingMode,
} from '@mcp-vertex/core/public';

export interface IHandoffDecision {
	readonly invoke: IProviderInvoke;
	readonly prompt: string;
	readonly mode: RoutingMode;
	readonly targetProvider: {
		readonly id: string;
		readonly modelId: string;
	};
	readonly estimatedCostTier: CostTier;
}
