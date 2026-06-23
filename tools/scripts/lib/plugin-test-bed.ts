/**
 * plugin-test-bed.ts — Solid-DRY extraction shared between verify and
 * generate-tools scripts.
 *
 * Both scripts previously inlined the same dance:
 *
 *   1. Build `parseCliArgs([...], workspaceRoot)` with a single
 *      `--plugins=<name>` arg.
 *   2. Call `assembleCliConfig(args, deps)` with a custom `import`
 *      adapter (so the real plugin module is loaded without a
 *      network roundtrip — the verify script wraps it in
 *      `() => import('../../plugins/<name>/src/index.ts')`).
 *   3. Sometimes override `readFile` (the verify script ships a
 *      synthetic config; the generate script routes deps.allowNetwork).
 *
 * After this split:
 *
 *   - **DRY**: one implementation, two callers.
 *   - **DIP**: callers depend on `assemblePluginForTest`, not on
 *     `assembleCliConfig` directly. Tests can pass a stub
 *     `IImportAdapter` and assert the assembled config.
 *   - **OCP**: new test fixtures (different synthetic config files,
 *     different plugin resolvers) extend the options, not the script.
 */
import {
	assembleCliConfig,
	parseCliArgs,
	type IAssembleCliDeps,
	type IAssembledCliConfig,
} from '@mcp-vertex/core/public';

/**
 * Solid-DIP: a tiny adapter that resolves a plugin name to its
 * default-exported plugin module. Production wires
 * `createLocalPluginImporter(workspaceRoot)` which loads
 * `plugins/<name>/src/index.ts` via dynamic import.
 *
 * Tests can pass any function `(name) => Promise<{default: ...}>`
 * — no path strings, no fs imports.
 */
export type IPluginImporter = (pluginName: string) => Promise<{
	default: unknown;
}>;

/**
 * Production importer: dynamic-imports `plugins/<name>/src/index.ts`
 * relative to the workspace root.
 */
export const createLocalPluginImporter =
	(_workspaceRoot: string): IPluginImporter =>
	(pluginName) =>
		import(`../../plugins/${pluginName}/src/index.ts`).then((mod) => ({
			default: mod.default,
		}));

/**
 * Optional override for `readFile` (the verify script ships a
 * synthetic config; the generate script routes deps.allowNetwork).
 * Default: no file (mcp-vertex.config.json not present).
 */
export interface IPluginTestBedOptions {
	readonly workspaceRoot: string;
	readonly pluginName: string;
	readonly importer?: IPluginImporter;
	/**
	 * When provided, the synthetic config payload. The `readFile`
	 * adapter returns this for every path ending in
	 * `mcp-vertex.config.json` and `undefined` for everything else.
	 */
	readonly syntheticConfig?: Record<string, unknown>;
}

/**
 * The fully-assembled config + the tool list, ready to drive the
 * verify probes or the harvest emitter.
 */
export interface IPluginTestBed {
	readonly config: IAssembledCliConfig['config'];
	readonly tools: readonly import('@mcp-vertex/core/public').IToolRegistration[];
}

/**
 * Build the assembly deps (importer + readFile) and call
 * `assembleCliConfig`. Pure factory over its inputs.
 */
export const assemblePluginForTest = async (
	options: IPluginTestBedOptions,
): Promise<IPluginTestBed> => {
	const args = parseCliArgs(
		[
			`--plugins=${options.pluginName}`,
			`--workspace=${options.workspaceRoot}`,
		],
		options.workspaceRoot,
	);

	const importer: IPluginImporter =
		options.importer ?? createLocalPluginImporter(options.workspaceRoot);

	const deps: IAssembleCliDeps = {
		import: (specifier: string) => importer(specifier),
		...(options.syntheticConfig !== undefined
			? {
					readFile: (absolutePath: string) =>
						absolutePath.endsWith('mcp-vertex.config.json')
							? JSON.stringify(options.syntheticConfig)
							: undefined,
				}
			: {}),
	};

	const { config } = await assembleCliConfig(args, deps);
	return {
		config,
		tools: config.extraTools ?? [],
	};
};
