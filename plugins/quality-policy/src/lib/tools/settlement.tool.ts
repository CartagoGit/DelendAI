/**
 * settlement.tool.ts — exposes `quality_policy_run_settlement`
 * for hosts that want to drive the settlement phase directly.
 *
 * The runner delegates to `runSettlement` and forwards its
 * outcome verbatim. Hosts are expected to:
 *   - on `green:true`, mark the head as `lastGreenHead` via
 *     `commit-policy:settlement_complete`;
 *   - on `green:false`, dispatch the repair agent and retry.
 */

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { compactOutputSchema, toolJson } from '@mcp-vertex/core/public';

import { runSettlement } from '../services/settlement-runner';

const RunSettlementInput = z
	.object({
		cwd: z.string().optional(),
		maxAttempts: z.number().int().positive().optional(),
		validateCommand: z.string().optional(),
		/**
		 * Transversal dry-run protocol (f00189): report the command and
		 * bounds this call WOULD use, and spawn nothing.
		 */
		dryRun: z.boolean().optional(),
	})
	.strict();

export const buildSettlementToolRegistration = (params: {
	readonly namespacePrefix: string;
	readonly defaultCwd: string;
}): IToolRegistration => ({
	id: 'quality_policy_run_settlement',
	tags: ['quality', 'settlement', 'q00013'],
	// This tool shells out to `bun run validate` with bounded retries. It
	// declared nothing, and `effects` is documented as "omit for read-only
	// tools" — so by omission it claimed to be read-only, and `verify:tools`
	// believed it and ran the whole suite as a smoke test.
	effects: ['spawn'],
	dryRunSupported: true,
	summary:
		'Run the q00013 settlement phase: bounded `bun run validate` retries; on success returns the green head sha; on failure returns the failing-file list for the repair agent.',
	register: async (server) => {
		server.registerTool(
			`${params.namespacePrefix}_run_settlement`,
			{
				outputSchema: compactOutputSchema(),
				description:
					'Run full validate during a settlement phase. Bounded retries with exponential backoff. Returns { green: true, headSha, attempts } or { green: false, attempts, failingFiles, lastError }.',
				inputSchema: RunSettlementInput,
			},
			async (toolArgs) => {
				const parsed = RunSettlementInput.safeParse(toolArgs ?? {});
				if (!parsed.success) {
					throw new Error(`invalid input: ${parsed.error.message}`);
				}
				if (parsed.data.dryRun === true) {
					return toolJson({
						dryRun: true,
						wouldRun:
							parsed.data.validateCommand ?? 'bun run validate',
						cwd: parsed.data.cwd ?? params.defaultCwd,
						maxAttempts: parsed.data.maxAttempts ?? null,
					});
				}
				const result = await runSettlement({
					cwd: parsed.data.cwd ?? params.defaultCwd,
					...(parsed.data.maxAttempts !== undefined
						? { maxAttempts: parsed.data.maxAttempts }
						: {}),
					...(parsed.data.validateCommand !== undefined
						? { validateCommand: parsed.data.validateCommand }
						: {}),
				});
				return toolJson(result);
			},
		);
	},
});
