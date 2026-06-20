import { z } from 'zod';

/**
 * Per-plugin configuration loaded from `mcp-vertex.config.json`. This is
 * the structured way to pass values to plugins: each plugin gets a
 * typed `options` object (any JSON — nested objects, arrays…) plus an
 * optional tool-namespace `prefix`. CLI flags override these roots; the
 * file is the place for anything beyond a quick override.
 *
 * ```jsonc
 * {
 *   "cacheDir": ".cache/mcp-vertex",
 *   "docsDir": "docs/mcp-vertex",
 *   "plugins": {
 *     "proposals": { "prefix": "work", "options": { "docsDir": "docs/x" } }
 *   }
 * }
 * ```
 */
export interface IMcpVertexPluginConfig {
	readonly prefix?: string;
	readonly options?: Readonly<Record<string, unknown>>;
}

export interface ILoopDetectorConfig {
	readonly enabled?: boolean;
	readonly repeatThreshold?: number;
	readonly nearRepeatThreshold?: number;
	readonly similarityThreshold?: number;
	readonly idleThreshold?: number;
	readonly noProgressThreshold?: number;
	readonly ringSize?: number;
	readonly gitCheckTools?: readonly string[];
	readonly handoffDir?: string;
	readonly handoffTtlDays?: number;
	readonly notifyOnDetect?: boolean;
}

export interface IMcpVertexConfigFile {
	/** Optional editor hint pointing at the published JSON Schema. */
	readonly $schema?: string;
	readonly cacheDir?: string;
	readonly docsDir?: string;
	/** Quality-gate commands per scope, surfaced by `get_validation_matrix`. */
	readonly validationMatrix?: {
		readonly scopes: Readonly<
			Record<string, ReadonlyArray<{ command: string; expect: string }>>
		>;
	};
	readonly plugins?: Readonly<Record<string, IMcpVertexPluginConfig>>;
	readonly loopDetector?: ILoopDetectorConfig;
}

/** Default config file name looked up at the workspace root. */
export const DEFAULT_CONFIG_FILENAME = 'mcp-vertex.config.json';

/** Structural schema for the config file (used by `--check`). */
export const CONFIG_FILE_SCHEMA = z
	.object({
		$schema: z.string().optional(),
		cacheDir: z.string().optional(),
		docsDir: z.string().optional(),
		validationMatrix: z
			.object({
				scopes: z.record(
					z.string(),
					z.array(
						z.object({
							command: z.string(),
							expect: z.string(),
						}),
					),
				),
			})
			.optional(),
		plugins: z
			.record(
				z.string(),
				z.object({
					prefix: z.string().optional(),
					options: z.record(z.string(), z.unknown()).optional(),
				}),
			)
			.optional(),
		loopDetector: z
			.object({
				enabled: z.boolean().optional(),
				repeatThreshold: z.number().optional(),
				nearRepeatThreshold: z.number().optional(),
				similarityThreshold: z.number().optional(),
				idleThreshold: z.number().optional(),
				noProgressThreshold: z.number().optional(),
				ringSize: z.number().optional(),
				gitCheckTools: z.array(z.string()).optional(),
				handoffDir: z.string().optional(),
				handoffTtlDays: z.number().optional(),
				notifyOnDetect: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

/**
 * Validate raw config-file contents and report problems. Used by the
 * `--check` doctor and at boot. Missing file → no issues. Invalid JSON
 * or schema violations → human-readable issue strings.
 */
export const diagnoseConfigFile = (
	raw: string | undefined,
): { readonly present: boolean; readonly issues: readonly string[] } => {
	if (raw === undefined) return { present: false, issues: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			present: true,
			issues: [
				`invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
	const result = CONFIG_FILE_SCHEMA.safeParse(parsed);
	if (result.success) return { present: true, issues: [] };
	return {
		present: true,
		issues: result.error.issues.map(
			(issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
		),
	};
};

/**
 * Parse a config file's raw contents. Pure and forgiving: missing
 * (`undefined`) or invalid JSON yields an empty config, so a typo in
 * the file never crashes the server — it just contributes nothing.
 */
export const parseConfigFile = (
	raw: string | undefined,
): IMcpVertexConfigFile => {
	if (raw === undefined) return {};
	try {
		const value = JSON.parse(raw) as unknown;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return value as IMcpVertexConfigFile;
		}
		return {};
	} catch {
		return {};
	}
};

/** Resolve the per-plugin entry, never undefined. */
export const pluginConfigFor = (
	config: IMcpVertexConfigFile,
	pluginName: string,
): IMcpVertexPluginConfig => config.plugins?.[pluginName] ?? {};
