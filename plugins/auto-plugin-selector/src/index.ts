import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildPluginsRecommendRegistration } from './lib/tools/plugins-recommend.tool';

const OptionsSchema = z.object({});

/**
 * `@mcp-vertex/auto-plugin-selector` — recommend the best plugin
 * set for THIS project from its signals (manifest, files, git,
 * task). Pure deterministic scorer by default; optional LLM
 * rationale pass is opt-in via the `refine` input. Pairs with the
 * plugin registry (f00141 S1/S2) so the recommendation becomes the
 * source of truth for what plugins a project should adopt.
 */
export default definePlugin({
	name: 'auto-plugin-selector',
	version: '0.1.0',
	describe:
		'Recommends the best plugin set for this project from its signals (manifest, files, git, task). Pure deterministic scorer by default; optional LLM rationale via auto-agent-selector.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildPluginsRecommendRegistration({
					namespacePrefix: ctx.namespacePrefix,
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