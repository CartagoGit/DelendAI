import {
	createWorkspaceFileReader,
	definePlugin,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { mergeConvention } from './convention';
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
	async register(ctx) {
		// r00003 S9-residual (SOLID L + I): parse ctx.options through
		// the schema declared above before forwarding downstream.
		// The previous code bypassed the schema with an unsafe cast
		// and silently accepted typos, unknown fields and wrong types.
		// A misconfigured host now gets a structured error before
		// register() returns.
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`test-convention plugin rejected its options: ${parsed.error.message}`,
			);
		}
		// The zod output is `T | undefined` for optional fields. The
		// IConventionOverrides interface (used by mergeConvention)
		// declares each field strictly optional without `| undefined`,
		// so we strip the undefined entries before forwarding.
		const opts = parsed.data;
		const convention = mergeConvention(
			opts as Parameters<typeof mergeConvention>[0],
		);
		const reader = createWorkspaceFileReader(ctx.workspace);
		const runner: IRunnerInfo = await detectRunner(reader);
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
