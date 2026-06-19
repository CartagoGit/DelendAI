import {
	createWorkspaceFileReader,
	definePlugin,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { mergeConvention, type IConventionOverrides } from './convention';
import { buildGetConvention } from './lib/tools/get-convention';
import { buildSuggestSpec } from './lib/tools/suggest-spec';
import { buildScanDrift } from './lib/tools/scan-drift';
import { detectRunner, type IRunnerInfo } from './lib/runners';
import {
	renderCoverageMarkdown,
	renderOverviewMarkdown,
	renderRunnersMarkdown,
} from './lib/knowledge';

/**
 * Strongly-typed options the host can supply via
 * `mcp-vertex.config.json#plugins.test-convention.options`.
 * Every field is optional — the plugin fills missing values with
 * {@link DEFAULT_CONVENTION}.
 */
const OptionsSchema = z
	.object({
		specExtension: z.string().min(1).optional(),
		specLayout: z
			.enum(['colocate', 'tests-mirror', 'tests-flat'])
			.optional(),
		runners: z.array(z.string()).optional(),
		mockStyle: z.enum(['vi', 'jest', 'auto']).optional(),
		requireDescribe: z.boolean().optional(),
		coverageThreshold: z
			.object({
				lines: z.number().min(0).max(100).optional(),
				functions: z.number().min(0).max(100).optional(),
				branches: z.number().min(0).max(100).optional(),
				statements: z.number().min(0).max(100).optional(),
			})
			.optional(),
		/** Compiled to `new RegExp(s, 'i')` inside the plugin. */
		forbiddenPatterns: z.array(z.string()).optional(),
		languages: z.array(z.string()).optional(),
	})
	.strict();

export default definePlugin({
	name: 'test-convention',
	version: '0.1.0',
	describe:
		'Publica la convención canónica de tests del repo (extensión, layout, mock API, cobertura) y herramientas para sugerir ubicación de specs y auditar drift contra el árbol real.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const convention = mergeConvention(ctx.options as IConventionOverrides);
		const reader = createWorkspaceFileReader(ctx.workspace);
		const runner: IRunnerInfo = detectRunner(reader);
		return {
			tools: [
				buildGetConvention({
					namespacePrefix: ctx.namespacePrefix,
					convention,
				}),
				buildSuggestSpec({
					namespacePrefix: ctx.namespacePrefix,
					convention,
				}),
				buildScanDrift({
					namespacePrefix: ctx.namespacePrefix,
					convention,
					reader,
					workspaceRoot: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'test-convention-overview',
					title: 'Test convention — overview',
					body: renderOverviewMarkdown(convention),
				},
				{
					id: 'test-convention-runners',
					title: 'Test runners — detection',
					body: renderRunnersMarkdown(reader, runner),
				},
				{
					id: 'test-convention-coverage',
					title: 'Coverage thresholds',
					body: renderCoverageMarkdown(convention),
				},
			],
		};
	},
});
