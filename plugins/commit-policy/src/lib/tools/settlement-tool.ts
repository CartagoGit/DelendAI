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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolOk } from '@delendai/core/public';

import { createWorkerRegistry } from '../settlement/worker.registry';

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
		...(deps.fileRel !== undefined ? { fileRel: deps.fileRel } : {}),
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

export const SettlementToolInput = z
	.object({
		action: z.enum(['status', 'enter', 'complete']),
		/** `complete` only: whether the settlement validate run was green. */
		green: z.boolean().optional(),
		/** `complete` only: the head the validate run judged. */
		headSha: z.string().min(7).optional(),
		reason: z.string().min(1).optional(),
		/** Report what the call would change, and change nothing. */
		dryRun: z.boolean().optional(),
	})
	.strict();

/**
 * Steer the settlement phase the commit-policy engine gates on:
 * read it, enter it once every worker has left, or complete it with the
 * validate result. Administrative, so it costs nothing in `tools/list`
 * until an agent looks for it.
 */
export const buildCommitPolicySettlementToolRegistration = (
	deps: ISettlementToolDeps & { readonly namespacePrefix: string },
): IToolRegistration => ({
	id: 'commit_policy_settlement',
	summary:
		'Read or steer the settlement phase commit-policy gates on: status, enter (only with no active workers), or complete with the validate result.',
	tags: ['commit-policy', 'settlement'],
	effects: ['write'],
	dryRunSupported: true,
	disclosure: 'administrative',
	register: async (server: McpServer) => {
		const tool = createSettlementTool(deps);
		server.registerTool(
			`${deps.namespacePrefix}_commit_policy_settlement`,
			{
				description:
					'Settlement phase control. action=status reads { phase, activeWorkers, lastGreenHead }. action=enter moves to settling, refused while workers are active. action=complete takes { green, headSha }: green goes stable and records the head, red stays settling for repair slices. dryRun reports without writing.',
				inputSchema: SettlementToolInput,
			},
			async (args) => runCommitPolicySettlementTool(tool, args),
		);
	},
});

export const runCommitPolicySettlementTool = async (
	tool: ReturnType<typeof createSettlementTool>,
	args: unknown,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const parsed = SettlementToolInput.safeParse(args ?? {});
	if (!parsed.success) {
		return toolError(
			`commit_policy_settlement rejected its input: ${parsed.error.message}`,
			'Pass action status, enter, or complete with green and headSha.',
		);
	}
	const input = parsed.data;
	if (input.action === 'status') return toolOk({ ...(await tool.status()) });
	if (input.action === 'enter') {
		if (input.dryRun === true) {
			const status = await tool.status();
			return toolOk({
				dryRun: true,
				wouldEnter: status.activeWorkers === 0,
				activeWorkers: status.activeWorkers,
			});
		}
		return toolOk(
			await tool.enter({
				...(input.reason !== undefined ? { reason: input.reason } : {}),
			}),
		);
	}
	if (input.green === undefined || input.headSha === undefined) {
		return toolError(
			'commit_policy_settlement complete needs green and headSha',
			'Pass the validate result as green and the head it judged as headSha.',
		);
	}
	if (input.dryRun === true) {
		return toolOk({
			dryRun: true,
			wouldLeavePhase: input.green ? 'stable' : 'settling',
			headSha: input.headSha,
		});
	}
	return toolOk(
		await tool.complete({ green: input.green, headSha: input.headSha }),
	);
};
