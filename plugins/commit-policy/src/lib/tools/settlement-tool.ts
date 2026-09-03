/**
 * settlement-tool.ts — exposes `settlement_status`, `settlement_enter`,
 * `settlement_complete` for the host to query and steer the
 * settlement phase.
 *
 * Phase transitions:
 *   - status   : read-only
 *   - enter    : request to transition into SETTLING (refused if
 *                activeWorkers > 0)
 *   - complete : caller reports the validate result. On green,
 *                phase becomes STABLE; on red, the runner may
 *                spawn repair slices and re-activate.
 */

import { z } from 'zod';

import { createWorkerRegistry } from '../settlement/worker-registry';

import type {
	ISettlementStatusOutput,
	ISettlementToolDeps,
} from '../contracts/interfaces/settlement-tool.interface';

export type {
	ISettlementStatusOutput,
	ISettlementToolDeps,
} from '../contracts/interfaces/settlement-tool.interface';

export const SettlementStatusInput = z.object({}).strict();

export const SettlementEnterInput = z
	.object({
		reason: z.string().min(1).optional(),
	})
	.strict();

export const SettlementCompleteInput = z
	.object({
		green: z.boolean(),
		headSha: z.string().min(7),
		notes: z.string().optional(),
	})
	.strict();

export const createSettlementTool = (deps: ISettlementToolDeps) => {
	const registry = createWorkerRegistry({
		workspaceRoot: deps.workspaceRoot,
	});
	return {
		async status(): Promise<ISettlementStatusOutput> {
			const state = await registry.read();
			const out: ISettlementStatusOutput = {
				phase: state.phase,
				activeWorkers: state.activeWorkers,
			};
			if (state.lastGreenHead !== undefined) {
				(out as { lastGreenHead?: string }).lastGreenHead =
					state.lastGreenHead;
			}
			return out;
		},
		async enter(
			_input: z.infer<typeof SettlementEnterInput>,
		): Promise<
			| { readonly ack: 'OK'; readonly phase: 'settling' }
			| { readonly ack: 'REFUSED'; readonly reason: string }
		> {
			const state = await registry.read();
			if (state.activeWorkers > 0) {
				return {
					ack: 'REFUSED',
					reason: `cannot enter SETTLING while ${state.activeWorkers} worker(s) are still active`,
				};
			}
			await registry.setPhase('settling');
			return { ack: 'OK', phase: 'settling' };
		},
		async complete(
			input: z.infer<typeof SettlementCompleteInput>,
		): Promise<
			| { readonly ack: 'OK'; readonly phase: 'stable' }
			| { readonly ack: 'REPAIR_REQUIRED'; readonly phase: 'settling' }
		> {
			if (input.green) {
				await registry.markGreen(input.headSha);
				return { ack: 'OK', phase: 'stable' };
			}
			await registry.setPhase('settling');
			return { ack: 'REPAIR_REQUIRED', phase: 'settling' };
		},
	};
};
