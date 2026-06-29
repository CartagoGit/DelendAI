/**
 * author-plugin.ts — f00089 U4.
 *
 * One client-callable action that lets a *target project's LLM* author a
 * complete, correct `IMcpPlugin` from a declarative spec AND register it on
 * the host **by PATH**, without ever reading mcp-vertex's core or its
 * internal plugins.
 *
 * It is the in-process, spec-driven sibling of the operator script
 * `tools/scripts/create-plugin.ts` (f00087 S2): both reuse the same pure
 * generator `scaffoldPluginFiles` (f00087) and the same atomic writer
 * `writeScaffoldedFiles` (f00087 S2). `authorPlugin` adds two things the
 * script does not:
 *
 *  1. a declarative tool spec — the LLM lists tools with their input/output
 *     fields and `authorPlugin` synthesises a correct `src/index.ts` with
 *     an `OptionsSchema`, one Zod-typed tool per spec entry (each with an
 *     `outputSchema`), and structured-JSON handlers; and
 *  2. **auto-registration** — it appends `plugins.<name>.path` to the
 *     target's `mcp-vertex.config.json` so the f00087 S1 loader picks the
 *     plugin up on the next host boot. The write is durable
 *     (`withFileMutex` + `writeFileAtomic`), idempotent, and never clobbers
 *     other plugin entries.
 *
 * The LLM gets back an actionable, internals-free result: what was created,
 * where it landed, how the host will load it, and what (if anything) it must
 * do next. No mcp-vertex source has to be read to use this.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import {
	DEFAULT_CONFIG_FILENAME,
	type IMcpVertexConfigFile,
	type IMcpVertexPluginConfig,
	type IScaffoldedFile,
	parseConfigFile,
	scaffoldPluginFiles,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	writeScaffoldedFiles,
	type IWriteScaffoldedFilesResult,
} from './write-scaffolded-files';

// ---------------------------------------------------------------------------
// Declarative spec — what the LLM passes in
// ---------------------------------------------------------------------------

/**
 * The scalar/array field types the LLM may declare for a tool's input or
 * output. Kept deliberately small and JSON-serialisable so the spec can
 * travel over an MCP tool boundary and so the LLM never writes Zod itself.
 */
export type IPluginFieldType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string[]'
	| 'number[]'
	| 'boolean[]'
	| 'json';

/** One declared field of a tool's input or output object. */
export interface IPluginFieldSpec {
	/** Field name (becomes a key in the Zod object). */
	readonly name: string;
	/** Field type; defaults to `'string'` when omitted. */
	readonly type?: IPluginFieldType;
	/** When true the field is `.optional()` in the generated schema. */
	readonly optional?: boolean;
	/** Optional human description, emitted as a `.describe(...)`. */
	readonly description?: string;
}

/** One tool the generated plugin should expose. */
export interface IPluginToolSpec {
	/**
	 * Tool id, namespaced at runtime by the plugin prefix. Lower-snake,
	 * e.g. `summarize`. The registered name becomes `<prefix>_<id>`.
	 */
	readonly id: string;
	/** One-line description shown to the model. */
	readonly description: string;
	/** Input object fields. Empty/omitted → `z.object({})`. */
	readonly input?: readonly IPluginFieldSpec[];
	/** Output object fields. Empty/omitted → an `{ ok, echo }` default. */
	readonly output?: readonly IPluginFieldSpec[];
}

/** The full declarative plugin spec the LLM authors. */
export interface IAuthorPluginSpec {
	/** Plugin id — also the default tool-namespace prefix and folder name. */
	readonly name: string;
	/** One-line, model-agnostic description of what the plugin adds. */
	readonly description: string;
	/**
	 * Tool-namespace prefix. Defaults to `name`. Lets several
	 * project-owned plugins coexist without tool-name collisions.
	 */
	readonly namespace?: string;
	/** npm scope for the generated `package.json` name. */
	readonly scope?: string;
	/**
	 * The tools to generate. When omitted the plugin keeps the canonical
	 * single `_ping` health-check tool produced by `scaffoldPluginFiles`.
	 */
	readonly tools?: readonly IPluginToolSpec[];
}

/** Options that steer where/how `authorPlugin` writes. */
export interface IAuthorPluginOptions {
	/**
	 * Absolute path to the target project root. The plugin is written
	 * under `<workspaceRoot>/<pluginsRoot>/<name>` and the config file is
	 * `<workspaceRoot>/mcp-vertex.config.json`.
	 */
	readonly workspaceRoot: string;
	/**
	 * Workspace-relative directory under which project plugins live.
	 * Default `plugins`. (f00088 convention root — a consumer that keeps
	 * plugins under `libs/plugins` passes that here.)
	 */
	readonly pluginsRoot?: string;
	/**
	 * When true, an existing scaffolded file is moved under `legacy/`
	 * before the fresh template lands. Default `false` (refuse to
	 * overwrite — same default as the MCP scaffold tool).
	 */
	readonly keepLegacy?: boolean;
	/** Config filename inside the workspace. Default `mcp-vertex.config.json`. */
	readonly configFileName?: string;
}

// ---------------------------------------------------------------------------
// Result — internals-free, actionable for the LLM
// ---------------------------------------------------------------------------

/** Outcome of registering the plugin in `mcp-vertex.config.json`. */
export interface IAuthorPluginRegistration {
	/** Absolute path of the config file that was written. */
	readonly configFile: string;
	/** The `plugins.<name>.path` value now recorded (workspace-relative). */
	readonly path: string;
	/**
	 * - `'added'`     — the entry did not exist and was created.
	 * - `'updated'`   — the entry existed with a different `path`; rewritten.
	 * - `'unchanged'` — the entry already pointed at this exact `path`.
	 */
	readonly action: 'added' | 'updated' | 'unchanged';
	/** The previous `path` when the entry already existed, else undefined. */
	readonly previousPath?: string;
}

/** What `authorPlugin` returns to the caller (and, transitively, the LLM). */
export interface IAuthorPluginResult {
	/** The plugin id that was authored. */
	readonly name: string;
	/** Resolved tool-namespace prefix (`namespace` or `name`). */
	readonly namespace: string;
	/** Absolute directory the plugin package was written to. */
	readonly pluginDir: string;
	/** Workspace-relative module path the host will load (the registered `path`). */
	readonly pluginPath: string;
	/** Result of the on-disk scaffold write (written/skipped/moved/...). */
	readonly files: IWriteScaffoldedFilesResult;
	/** Result of the config auto-registration. */
	readonly registration: IAuthorPluginRegistration;
	/** Fully-qualified tool names the host will expose (`<prefix>_<id>`). */
	readonly tools: readonly string[];
	/**
	 * A short, internals-free instruction the LLM can surface verbatim:
	 * what was created and how the host loads it.
	 */
	readonly nextSteps: string;
}

// ---------------------------------------------------------------------------
// Spec → Zod source synthesis (pure)
// ---------------------------------------------------------------------------

const zodForType = (type: IPluginFieldType | undefined): string => {
	switch (type) {
		case 'number':
			return 'z.number()';
		case 'boolean':
			return 'z.boolean()';
		case 'string[]':
			return 'z.array(z.string())';
		case 'number[]':
			return 'z.array(z.number())';
		case 'boolean[]':
			return 'z.array(z.boolean())';
		case 'json':
			return 'z.unknown()';
		default:
			return 'z.string()';
	}
};

const sanitizeText = (value: string): string => value.replace(/['\\]/g, '');

const zodFieldLine = (field: IPluginFieldSpec): string => {
	let expr = zodForType(field.type);
	if (field.description) {
		expr += `.describe('${sanitizeText(field.description)}')`;
	}
	if (field.optional) expr += '.optional()';
	return `\t\t\t\t\t\t\t${JSON.stringify(field.name)}: ${expr},`;
};

const zodObjectSource = (fields: readonly IPluginFieldSpec[]): string => {
	if (fields.length === 0) return 'z.object({})';
	const lines = fields.map(zodFieldLine).join('\n');
	return `z.object({\n${lines}\n\t\t\t\t\t\t})`;
};

/** Lower-snake-safe id for a tool. */
const safeToolId = (id: string): string =>
	id
		.trim()
		.replace(/[^a-zA-Z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '');

/**
 * Render the `tools: [...]` array body for the spec's tools. Each tool
 * gets an `inputSchema`, an `outputSchema`, and a deterministic
 * structured-JSON handler so any model can consume it. The handler is a
 * correct, type-checking stub the consumer fills in.
 */
const renderToolEntries = (tools: readonly IPluginToolSpec[]): string =>
	tools
		.map((tool) => {
			const id = safeToolId(tool.id);
			const inputSrc = zodObjectSource(tool.input ?? []);
			const outputFields =
				tool.output && tool.output.length > 0
					? tool.output
					: ([
							{ name: 'ok', type: 'boolean' },
							{ name: 'echo', type: 'json' },
						] as const);
			const outputSrc = zodObjectSource(outputFields);
			const echoKeys = (tool.input ?? []).map((f) => f.name);
			const echoExpr =
				outputFields.length === 2 &&
				outputFields[0]?.name === 'ok' &&
				outputFields[1]?.name === 'echo'
					? `{ ok: true, echo: args }`
					: `({} as z.infer<typeof outputSchema>)`;
			return `				{
					id: '${id}',
					register: async (server) => {
						const inputSchema = ${inputSrc};
						const outputSchema = ${outputSrc};
						server.registerTool(
							\`\${prefix}_${id}\`,
							{
								description: '${sanitizeText(tool.description)}',
								inputSchema,
								outputSchema,
							},
							async (args: z.infer<typeof inputSchema>) => {
								// TODO(${id}): implement. Returns structured JSON
								// matching outputSchema so any model can consume it.
								void [${echoKeys.map((k) => `args[${JSON.stringify(k)}]`).join(', ')}];
								const result = ${echoExpr};
								return {
									content: [
										{
											type: 'text' as const,
											text: JSON.stringify(result, null, '\\t'),
										},
									],
									structuredContent: result,
								};
							},
						);
					},
				},`;
		})
		.join('\n');

/**
 * Build the full `src/index.ts` for a spec that declares its own tools.
 * Reuses the *shape* `scaffoldPluginFiles` emits (definePlugin, prefix,
 * OptionsSchema, knowledge) but with the spec's tools instead of the
 * single `_ping` stub.
 */
const renderSpecIndex = (
	id: string,
	prefix: string,
	description: string,
	tools: readonly IPluginToolSpec[],
): string => {
	const safe = sanitizeText(description);
	return `import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

/** Free-form, validated options this plugin accepts from mcp-vertex.config.json. */
export const OptionsSchema = z.object({}).passthrough();

/**
 * ${safe}
 *
 * Loaded by mcp-vertex from \`mcp-vertex.config.json#plugins.${id}.path\`.
 * Every tool is namespaced by the plugin prefix (default '${prefix}') and
 * returns structured JSON so any agent or model can consume it
 * deterministically.
 */
export default definePlugin({
	name: '${id}',
	version: '0.1.0',
	describe: '${safe}',
	register(ctx) {
		const prefix = ctx.namespacePrefix; // defaults to '${prefix}'
		OptionsSchema.parse(ctx.options ?? {});
		return {
			tools: [
${renderToolEntries(tools)}
			],
			knowledge: [
				{
					id: '${id}-overview',
					title: '${id} plugin',
					body: '${safe}',
				},
			],
		};
	},
});
`;
};

/**
 * Generate the plugin's files from the spec, reusing
 * `scaffoldPluginFiles` for the boilerplate (package.json, tsconfig,
 * README, base index) and overlaying a spec-driven `src/index.ts` when
 * the spec declares its own tools. The paths returned are relative to the
 * plugin root (`scaffoldPluginFiles` prefixes them with `plugins/<id>/`;
 * we strip that so they land flat under the plugin dir).
 */
const generatePluginFiles = (
	spec: IAuthorPluginSpec,
): {
	readonly id: string;
	readonly files: readonly IScaffoldedFile[];
} => {
	const base = scaffoldPluginFiles({
		pluginName: spec.name,
		description: spec.description,
		...(spec.scope ? { scope: spec.scope } : {}),
	});
	// Derive the kebab id `scaffoldPluginFiles` used from its first path
	// (`plugins/<id>/package.json`) so we strip the right prefix without
	// re-implementing the kebab transform.
	const firstPath = base[0]?.path ?? `plugins/${spec.name}/package.json`;
	const id = firstPath.split('/')[1] ?? spec.name;
	const idPrefix = `plugins/${id}/`;
	const prefix = spec.namespace ?? id;
	const flattened = base.flatMap((file) =>
		file.path.startsWith(idPrefix)
			? [
					{
						path: file.path.slice(idPrefix.length),
						content: file.content,
					},
				]
			: [{ path: file.path, content: file.content }],
	);
	const tools = spec.tools ?? [];
	if (tools.length === 0) return { id, files: flattened };
	const files = flattened.map((file) =>
		file.path === 'src/index.ts'
			? {
					path: file.path,
					content: renderSpecIndex(
						id,
						prefix,
						spec.description,
						tools,
					),
				}
			: file,
	);
	return { id, files };
};

// ---------------------------------------------------------------------------
// Config auto-registration (durable, idempotent, non-destructive)
// ---------------------------------------------------------------------------

const toPosix = (value: string): string => value.replace(/\\/g, '/');

/**
 * Compute the workspace-relative module path the loader should record.
 * The f00087 S1 loader treats a value with a separator as a path; we
 * always emit a `./`-prefixed relative path so it is unambiguous and
 * portable across hosts.
 */
const relativePluginPath = (
	workspaceRoot: string,
	pluginDir: string,
): string => {
	const rel = toPosix(
		relative(workspaceRoot, join(pluginDir, 'src/index.ts')),
	);
	return rel.startsWith('.') ? rel : `./${rel}`;
};

/**
 * Append/update `plugins.<name>.path` in the target config, durably and
 * without disturbing any other entry. Returns the action taken so the
 * caller can tell the LLM whether anything changed.
 */
const registerPluginPath = async (
	configFile: string,
	name: string,
	pluginPath: string,
	extra: IMcpVertexPluginConfig | undefined,
): Promise<IAuthorPluginRegistration> =>
	withFileMutex(configFile, async () => {
		let raw: string | undefined;
		try {
			raw = await readFile(configFile, 'utf8');
		} catch {
			raw = undefined;
		}
		const current: IMcpVertexConfigFile = parseConfigFile(raw);
		const plugins: Record<string, IMcpVertexPluginConfig> = {
			...(current.plugins ?? {}),
		};
		const existing = plugins[name];
		const previousPath = existing?.path;
		const action: IAuthorPluginRegistration['action'] =
			existing === undefined
				? 'added'
				: previousPath === pluginPath
					? 'unchanged'
					: 'updated';

		// Merge non-destructively: keep the existing entry's prefix/options,
		// only ever (re)writing `path`. `extra` lets the caller seed a
		// prefix when the entry is brand new.
		const merged: IMcpVertexPluginConfig = {
			...(extra ?? {}),
			...(existing ?? {}),
			path: pluginPath,
		};

		const next: IMcpVertexConfigFile = {
			...current,
			plugins: { ...plugins, [name]: merged },
		};

		// Only touch disk when something actually changed — keeps repeated
		// `authorPlugin` calls idempotent and avoids churning the file.
		if (action !== 'unchanged') {
			await writeFileAtomic(
				configFile,
				`${JSON.stringify(next, null, '\t')}\n`,
			);
		}

		return {
			configFile,
			path: pluginPath,
			action,
			...(previousPath !== undefined ? { previousPath } : {}),
		};
	});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Author a complete plugin from a declarative spec and register it with
 * the host by PATH. One call: generate → write → register. The caller
 * (and the LLM behind it) never has to read mcp-vertex internals.
 *
 * Steps:
 *  1. Synthesise the plugin's files from the spec, reusing
 *     `scaffoldPluginFiles` for the boilerplate (f00087).
 *  2. Write them under `<workspaceRoot>/<pluginsRoot>/<name>` via the
 *     canonical atomic writer `writeScaffoldedFiles` (f00087 S2).
 *  3. Append/update `plugins.<name>.path` in the target's
 *     `mcp-vertex.config.json`, durably and non-destructively.
 *
 * @throws if `workspaceRoot` is not absolute (the target root must be
 *   explicit; we never guess from `process.cwd()`).
 */
export const authorPlugin = async (
	spec: IAuthorPluginSpec,
	options: IAuthorPluginOptions,
): Promise<IAuthorPluginResult> => {
	if (!isAbsolute(options.workspaceRoot)) {
		throw new Error(
			`authorPlugin: workspaceRoot must be an absolute path, got "${options.workspaceRoot}"`,
		);
	}
	if (!spec.name.trim()) {
		throw new Error('authorPlugin: spec.name must be a non-empty string');
	}

	const pluginsRoot = options.pluginsRoot ?? 'plugins';
	const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILENAME;

	const { id, files } = generatePluginFiles(spec);
	const pluginDir = join(options.workspaceRoot, pluginsRoot, id);

	const writeResult = await writeScaffoldedFiles(pluginDir, files, {
		...(options.keepLegacy !== undefined
			? { keepLegacy: options.keepLegacy }
			: {}),
	});

	const pluginPath = relativePluginPath(options.workspaceRoot, pluginDir);
	const configFile = join(options.workspaceRoot, configFileName);
	const prefix = spec.namespace ?? id;
	const registration = await registerPluginPath(
		configFile,
		id,
		pluginPath,
		spec.namespace ? { prefix: spec.namespace } : undefined,
	);

	const toolIds =
		spec.tools && spec.tools.length > 0
			? spec.tools.map((tool) => safeToolId(tool.id))
			: ['ping'];
	const tools = toolIds.map((toolId) => `${prefix}_${toolId}`);

	const nextSteps =
		`Plugin "${id}" was written to ${toPosix(relative(options.workspaceRoot, pluginDir))} ` +
		`and registered in ${configFileName} as plugins.${id}.path = "${pluginPath}". ` +
		`Restart the mcp-vertex host (or your editor's MCP server) to load it; ` +
		`its tools (${tools.join(', ')}) will appear under the "${prefix}" namespace. ` +
		`No mcp-vertex internals need to be read — edit ${toPosix(
			join(relative(options.workspaceRoot, pluginDir), 'src/index.ts'),
		)} to fill in each tool's logic.`;

	return {
		name: id,
		namespace: prefix,
		pluginDir,
		pluginPath,
		files: writeResult,
		registration,
		tools,
		nextSteps,
	};
};
