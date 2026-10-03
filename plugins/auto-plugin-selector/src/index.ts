import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildPluginsRecommendRegistration } from './lib/tools/plugins-recommend.tool';
import { firstPartyPluginCandidates } from './lib/catalog/first-party-candidates';

/**
 * r00025 S4 — optional `weights` block (one per signal in the
 * scoring formula). Hosts can override any subset; missing keys
 * fall back to the defaults declared in
 * `recommend-plugins.ts#DEFAULT_WEIGHTS`.
 */
const OptionsSchema = z.object({
	weights: z
		.object({
			match: z.number().optional(),
			tokenTax: z.number().optional(),
			latencyTax: z.number().optional(),
			historicalSuccess: z.number().optional(),
			permissionRisk: z.number().optional(),
		})
		.optional(),
});

/**
 * `@delendai/auto-plugin-selector` — recommend the best plugin
 * set for THIS project from its signals (manifest, files, git,
 * task). Pure deterministic scorer by default; optional LLM
 * rationale pass is opt-in via the `refine` input. Pairs with the
 * plugin registry (f00141 S1/S2) so the recommendation becomes the
 * source of truth for what plugins a project should adopt.
 */
export default definePlugin({
	name: 'auto-plugin-selector',
	version: '0.1.1',
	describe:
		'Recommends the best plugin set for this project from its signals (manifest, files, git, task). Pure deterministic scorer by default; optional LLM rationale via auto-agent-selector.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		const weights = parsed.success ? parsed.data.weights : undefined;
		return {
			tools: [
				buildPluginsRecommendRegistration({
					namespacePrefix: ctx.namespacePrefix,
					candidates: firstPartyPluginCandidates(),
					...(weights === undefined ? {} : { weights }),
				}),
			],
			knowledge: [
				{
					id: 'auto-plugin-selector-overview',
					title: 'Plugin-fit scorer',
					body: [
						'# Plugin-fit scorer (f00142)',
						'',
						'Ships `plugins_recommend { signals?, limit? }` — a pure',
						'ranker over a plugin catalog against project signals',
						'(pack, languages, hasDocsSite, isCliTool, hasBackend,',
						'hasTests). Same input -> same output; no API key needed.',
						'',
						'An optional LLM refinement pass can add rationale per',
						'plugin via `auto-agent-selector` (cheapest capable model),',
						'but the recommendation is fully functional without it.',
						'',
						'Applying the recommendation is consent-gated and reuses',
						'`configuration_center` + the wiring primitives (f00120).',
					].join('\n'),
				},
			],
		};
	},
});
