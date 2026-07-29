/**
 * f00127 — `prompt-eval` plugin entry point.
 *
 * S1 (eval harness): `eval_run` runs a prompt across the ranked roster,
 * independent-spend-guarded per provider, returning per-provider cost +
 * pass/fail + the cheapest passing provider.
 * S2 (scoring + report): `eval_report` scores a flat list of attempts
 * and returns a ranked cost×quality report — pure, no I/O.
 * S3 (calibration write-through): tracked separately under f00127.
 *
 * The harness is pure over injected `allowSpend` / `runProvider` /
 * `checkAcceptance` seams — same shape `auto-agent-selector` and
 * `orchestrator-runner` use, so evaluation is deterministic and
 * unit-testable without spawning or spending.
 */
import z from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';
import type { ICalibrationStore } from '@mcp-vertex/auto-agent-selector/public';

import { buildEvalRunRegistration } from './lib/tools/eval-run.tool';
import { buildEvalReportToolRegistration } from './lib/tools/eval-report.tool';

const OptionsSchema = z.object({
	providers: z
		.array(
			z.object({
				id: z.string(),
				label: z.string(),
				costTier: z.union([
					z.literal(1),
					z.literal(2),
					z.literal(3),
					z.literal(4),
					z.literal(5),
				]),
			}),
		)
		.optional(),
});

const hasCalibrationStore = (value: unknown): value is ICalibrationStore => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.append === 'function' &&
		typeof candidate.readAll === 'function'
	);
};

export default definePlugin({
	name: 'prompt-eval',
	version: '0.1.0',
	describe:
		"Benchmark a prompt across reachable providers on cost × quality using the project's acceptance gate; writes win-rates into auto-agent-selector calibration. Spend-guarded.",
	optionsSchema: OptionsSchema,
	register(ctx) {
		const rawOptions = (ctx.options ?? {}) as {
			calibrationStore?: unknown;
		};
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`prompt-eval plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const providers = parsed.data.providers ?? [];
		const calibrationStore = hasCalibrationStore(
			rawOptions.calibrationStore,
		)
			? rawOptions.calibrationStore
			: undefined;
		// Wiring is intentionally a no-op pass-through stub: the contract
		// (`allowSpend`, `runProvider`, `checkAcceptance`) is provided by
		// the host (auto-agent-selector + orchestrator-runner) at runtime.
		const deps = {
			allowSpend: async () => false as const,
			runProvider: async () => ({
				output: undefined,
				costUsd: 0,
			}),
			checkAcceptance: async () => false as const,
		};
		return {
			tools: [
				buildEvalRunRegistration({
					namespacePrefix: ctx.namespacePrefix,
					providers,
					...(calibrationStore === undefined
						? {}
						: { calibrationStore }),
					...deps,
				}),
				buildEvalReportToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
				}),
			],
			knowledge: [
				{
					id: 'prompt-eval',
					title: 'Prompt eval — benchmark prompts and feed routing calibration',
					body: [
						'Use this plugin to benchmark a prompt across the reachable provider roster.',
						'',
						'- Run `<prefix>_eval_run` to collect spend-guarded attempts and write winner data into calibration when a store is injected.',
						'- Run `<prefix>_eval_report` to rank the attempts on cost × quality.',
					].join('\n'),
				},
			],
		};
	},
});
