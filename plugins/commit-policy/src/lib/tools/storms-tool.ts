/**
 * storms-tool.ts — `commit_policy_storms`.
 *
 * x00419 S3: a read-only diagnostic tool that returns the current
 * StormDetector snapshot. The agent uses this to consume its own
 * stderr in a machine-readable form, then files a `kind: repair`
 * proposal for any storm that crossed the threshold.
 *
 * The tool is intentionally side-effect free: it does NOT create
 * a repair proposal automatically. That decision belongs to the
 * host boot hook (S5) or to the agent that called the tool —
 * either way, the loop is closed in this codebase rather than in
 * a human's terminal.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import {
	StormDetector,
	inferSuggestedFix,
	type IStormEvent,
} from '../services/storm-detector';
import type { StormLog } from '../services/storm-log';

export interface IStormsToolOptions {
	readonly namespacePrefix: string;
	/**
	 * Optional pre-built detector (e.g. one the host wired into
	 * the engine event sink). When `undefined`, the tool creates
	 * its own detector — useful in unit tests and for callers that
	 * just want to inspect the snapshot after seeding events.
	 */
	readonly detector?: StormDetector;
	/**
	 * Optional sink of historical events. When provided, the tool
	 * replays these into the detector before snapshotting. The host
	 * uses this to feed the in-process engine's stderr stream.
	 */
	readonly observedEvents?: readonly IStormEvent[];
	/**
	 * Optional callback invoked once after every successful
	 * snapshot. The host uses this to persist the snapshot via
	 * `StormLog` so the count survives a restart.
	 */
	readonly onSnapshot?: (() => void) | undefined;
	/**
	 * Optional reference to the StormLog; the tool can decide
	 * whether to persist the snapshot itself rather than relying
	 * on a host callback. Currently unused — we just thread it
	 * through for the host's boot-hook convenience.
	 */
	readonly stormLog?: StormLog | undefined;
}

const IStormSchema = z.object({
	code: z.string(),
	trigger: z.string(),
	count: z.number().int().nonnegative(),
	windowSeconds: z.number().int().positive(),
	sampleProposalIds: z.array(z.string()),
	firstSeenAt: z.number().int(),
	lastSeenAt: z.number().int(),
	suggestedFix: z.string().optional(),
	exceedsThreshold: z.boolean(),
});

const OutputSchema = z.object({
	storms: z.array(IStormSchema),
	totalEventsInWindow: z.number().int().nonnegative(),
	windowSeconds: z.number().int().positive(),
	threshold: z.number().int().positive(),
});

export const runCommitPolicyStorms = async (
	options: IStormsToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	try {
		const detector = options.detector ?? new StormDetector();
		for (const event of options.observedEvents ?? []) {
			// Backfill the suggestedFix when the producer did not
			// supply one. Keeps the tool output self-describing.
			detector.observe({
				...event,
				...(event.suggestedFix === undefined
					? {
							suggestedFix:
								inferSuggestedFix(event.code) ??
								`inspect ${event.code}`,
						}
					: {}),
			});
		}
		const snapshot = detector.snapshot();
		options.onSnapshot?.();
		return toolOk(snapshot);
	} catch (error: unknown) {
		return toolError(
			'commit_policy_storms failed: ' +
				(error instanceof Error ? error.message : String(error)),
		);
	}
};

export const buildStormsToolRegistration = (
	options: IStormsToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_storms',
	summary:
		'Read the live StormDetector snapshot: per (trigger, code) repeat counts, sample proposal IDs, and a one-line repair hint. x00419 lets agents consume their own stderr and file `kind: repair` proposals without a human intermediary.',
	tags: ['commit-policy', 'diagnostics', 'x00419', 'read-only'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_storms`,
			{
				description:
					'Read-only diagnostic that returns the StormDetector snapshot. Use when the operator (or another agent) says "check the logs", "why is this code repeating", or after a slice returns ERR.',
				outputSchema: OutputSchema,
				inputSchema: z.object({}),
			},
			async () => runCommitPolicyStorms(options),
		);
	},
});
