import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildAutoRecommendRegistration } from './lib/tools/auto-recommend.tool';
import { buildAutoRecordRegistration } from './lib/tools/auto-record.tool';
import { buildAutoRunRegistration } from './lib/tools/auto-run.tool';
import { buildAutoStatusRegistration } from './lib/tools/auto-status.tool';

/** The dial default when the host does not set one (lean cheap, not the floor). */
const DEFAULT_TRADEOFF = 7;

/**
 * `@mcp-vertex/auto-agent-selector` — zero-config multi-agent routing (f00119).
 *
 * Add the plugin and it auto-discovers every LLM/agent the workspace can reach
 * (CLI on PATH + API keys in the environment), so the router can pick the most
 * cost-effective one per task. The user stays in control: recommendations are
 * advisory, cost is a first-class knob, and a per-task pin always wins.
 *
 * This slice (S1) ships discovery + `auto_status`; later slices add the cost
 * model, `auto_recommend`, quality up-escalation and calibration (see f00119).
 * `register()` is pure — no subprocess, no install — discovery runs on first
 * tool call.
 */
const OptionsSchema = z
	.object({
		/**
		 * A single cost↔quality dial, 0 (always the strongest, cost no
		 * object) … 10 (always the cheapest that works). Mirrors the
		 * industry-standard Auto Router dial; consumed by the routing slices.
		 * Omitted = 7 (lean toward cheap but not the floor).
		 */
		costQualityTradeoff: z.number().int().min(0).max(10).optional(),
	})
	.strict();

export default definePlugin({
	name: 'auto-agent-selector',
	version: '0.1.0',
	describe:
		'Ruteo multi-agente sin configuración: descubre cada LLM/agente disponible (CLI en PATH + API keys), recomienda el más rentable por tarea (el usuario decide y puede fijar), y escala a un modelo más fuerte solo si el barato falla la puerta de aceptación del proyecto.',
	optionsSchema: OptionsSchema,
	configExample: {
		summary:
			'Añádelo y funciona sin configurar nada. Opcional: ajusta el dial coste↔calidad (0 = siempre el más potente, 10 = siempre el más barato).',
		options: { costQualityTradeoff: 7 },
	},
	// Calibration outcomes are accumulated results (win-rate history), not
	// derivable cache — keep them under `<cacheDir>/results/<name>`.
	cacheNamespace: 'results',
	async register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		const defaultTradeoff = parsed.success
			? (parsed.data.costQualityTradeoff ?? DEFAULT_TRADEOFF)
			: DEFAULT_TRADEOFF;
		const calibrationDir = ctx.workspace.resolve(ctx.pluginCacheDir);
		return {
			tools: [
				buildAutoStatusRegistration({
					namespacePrefix: ctx.namespacePrefix,
				}),
				buildAutoRecommendRegistration({
					namespacePrefix: ctx.namespacePrefix,
					defaultTradeoff,
					calibrationDir,
				}),
				buildAutoRecordRegistration({
					namespacePrefix: ctx.namespacePrefix,
					calibrationDir,
				}),
				buildAutoRunRegistration({
					namespacePrefix: ctx.namespacePrefix,
					defaultTradeoff,
				}),
			],
			knowledge: [
				{
					id: 'auto-agent-selector',
					title: 'Auto agent selector — route each task to the best-value LLM',
					body: [
						'This workspace can route work across whatever LLM/agent',
						'providers are reachable (CLI on PATH + API keys).',
						'',
						'- Run `<prefix>_auto_status` to see the reachable providers',
						'  (cheapest-first) and how to enable any that are missing.',
						'- Cost is a first-class knob (`costQualityTradeoff`, 0 strongest',
						'  … 10 cheapest); the selector recommends, you decide, and a',
						'  per-task pin always wins.',
					].join('\n'),
				},
			],
		};
	},
});
