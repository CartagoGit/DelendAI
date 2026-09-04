/**
 * project-plugins.ts — f00089 U4.
 *
 * One client-callable action that lets a *target project's LLM* author a
 * complete, correct `IMcpPlugin` from a declarative spec AND register it on
 * the host **by PATH**, without ever reading delendai's core or its
 * internal plugins.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import {
	DEFAULT_CONFIG_FILENAME,
	parseConfigFile,
	scaffoldPluginFiles,
} from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';
import type {
	IDelendaiConfigFile,
	IDelendaiPluginConfig,
	IScaffoldedFile,
} from '@delendai/core/public';

import {
	writeScaffoldedFiles,
	type IWriteScaffoldedFilesResult,
} from './write-scaffolded-files';

export type IPluginFieldType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string[]'
	| 'number[]'
	| 'boolean[]'
	| 'json';

export interface IPluginFieldSpec {
	readonly name: string;
	readonly type?: IPluginFieldType;
	readonly optional?: boolean;
	readonly description?: string;
}

export interface IPluginToolSpec {
	readonly id: string;
	readonly description: string;
	readonly input?: readonly IPluginFieldSpec[];
	readonly output?: readonly IPluginFieldSpec[];
}

export interface IProjectPluginSpec {
	readonly name: string;
	readonly description: string;
	readonly namespace?: string;
	readonly scope?: string;
	readonly tools?: readonly IPluginToolSpec[];
}

export interface IProjectPluginOptions {
	readonly workspaceRoot: string;
	readonly pluginsRoot?: string;
	readonly keepLegacy?: boolean;
	readonly configFileName?: string;
}

export interface IProjectPluginRegistration {
	readonly configFile: string;
	readonly path: string;
	readonly action: 'added' | 'updated' | 'unchanged';
	readonly previousPath?: string;
}

export interface IProjectPluginResult {
	readonly name: string;
	readonly namespace: string;
	readonly pluginDir: string;
	readonly pluginPath: string;
	readonly files: IWriteScaffoldedFilesResult;
	readonly registration: IProjectPluginRegistration;
	readonly tools: readonly string[];
	readonly nextSteps: string;
}

export interface IRepairProjectPluginResult extends IProjectPluginResult {
	readonly repaired: readonly string[];
	readonly preserved: readonly string[];
	readonly report: string;
}

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

const safeToolId = (id: string): string =>
	id
		.trim()
		.replace(/[^a-zA-Z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '');

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
			const echoKeys = (tool.input ?? []).map((field) => field.name);
			const echoExpr =
				outputFields.length === 2 &&
				outputFields[0]?.name === 'ok' &&
				outputFields[1]?.name === 'echo'
					? `{ ok: true, echo: args }`
					: `({} as z.infer<typeof outputSchema>)`;
			return `\t\t\t\t{\n\t\t\t\t\tid: '${id}',\n\t\t\t\t\tregister: async (server) => {\n\t\t\t\t\t\tconst inputSchema = ${inputSrc};\n\t\t\t\t\t\tconst outputSchema = ${outputSrc};\n\t\t\t\t\t\tserver.registerTool(\n\t\t\t\t\t\t\t\`\${prefix}_${id}\`,\n\t\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\tdescription: '${sanitizeText(tool.description)}',\n\t\t\t\t\t\t\t\tinputSchema,\n\t\t\t\t\t\t\t\toutputSchema,\n\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\tasync (args: z.infer<typeof inputSchema>) => {\n\t\t\t\t\t\t\t\tvoid [${echoKeys.map((key) => `args[${JSON.stringify(key)}]`).join(', ')}];\n\t\t\t\t\t\t\t\tconst result = ${echoExpr};\n\t\t\t\t\t\t\t\treturn {\n\t\t\t\t\t\t\t\t\tcontent: [\n\t\t\t\t\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\t\t\t\ttype: 'text' as const,\n\t\t\t\t\t\t\t\t\t\t\ttext: JSON.stringify(result, null, '\\t'),\n\t\t\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\t\t],\n\t\t\t\t\t\t\t\t\tstructuredContent: result,\n\t\t\t\t\t\t\t\t};\n\t\t\t\t\t\t\t},\n\t\t\t\t\t\t);\n\t\t\t\t\t},\n\t\t\t\t},`;
		})
		.join('\n');

const renderSpecIndex = (
	id: string,
	prefix: string,
	description: string,
	tools: readonly IPluginToolSpec[],
): string => {
	const safe = sanitizeText(description);
	return `import { definePlugin } from '@delendai/core/plugin';\nimport z from 'zod';\n\n/** Free-form, validated options this plugin accepts from delendai.config.json. */\nexport const OptionsSchema = z.object({}).passthrough();\n\n/**\n * ${safe}\n *\n * Loaded by delendai from \`delendai.config.json#plugins.${id}.path\`.\n * Every tool is namespaced by the plugin prefix (default '${prefix}') and\n * returns structured JSON so any agent or model can consume it\n * deterministically.\n */\nexport default definePlugin({\n\tname: '${id}',\n\tversion: '0.1.0',\n\tdescribe: '${safe}',\n\tregister(ctx) {\n\t\tconst prefix = ctx.namespacePrefix;\n\t\tOptionsSchema.parse(ctx.options ?? {});\n\t\treturn {\n\t\t\ttools: [\n${renderToolEntries(tools)}\n\t\t\t],\n\t\t\tknowledge: [\n\t\t\t\t{\n\t\t\t\t\tid: '${id}-overview',\n\t\t\t\t\ttitle: '${id} plugin',\n\t\t\t\t\tbody: '${safe}',\n\t\t\t\t},\n\t\t\t],\n\t\t};\n\t},\n});\n`;
};

const generatePluginFiles = (
	spec: IProjectPluginSpec,
): {
	readonly id: string;
	readonly files: readonly IScaffoldedFile[];
} => {
	const base = scaffoldPluginFiles({
		pluginName: spec.name,
		description: spec.description,
		...(spec.scope ? { scope: spec.scope } : {}),
	});
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
	return {
		id,
		files: flattened.map((file) =>
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
		),
	};
};

const toPosix = (value: string): string => value.replace(/\\/g, '/');

const relativePluginPath = (
	workspaceRoot: string,
	pluginDir: string,
): string => {
	const rel = toPosix(
		relative(workspaceRoot, join(pluginDir, 'src/index.ts')),
	);
	return rel.startsWith('.') ? rel : `./${rel}`;
};

const registerPluginPath = async (
	configFile: string,
	name: string,
	pluginPath: string,
	extra: IDelendaiPluginConfig | undefined,
): Promise<IProjectPluginRegistration> =>
	withFileMutex(configFile, async () => {
		let raw: string | undefined;
		try {
			raw = await readFile(configFile, 'utf8');
		} catch {
			raw = undefined;
		}
		const current: IDelendaiConfigFile = parseConfigFile(raw);
		const plugins: Record<string, IDelendaiPluginConfig> = {
			...(current.plugins ?? {}),
		};
		const existing = plugins[name];
		const previousPath = existing?.path;
		const action: IProjectPluginRegistration['action'] =
			existing === undefined
				? 'added'
				: previousPath === pluginPath
					? 'unchanged'
					: 'updated';

		const merged: IDelendaiPluginConfig = {
			...(extra ?? {}),
			...(existing ?? {}),
			path: pluginPath,
		};

		const next: IDelendaiConfigFile = {
			...current,
			plugins: { ...plugins, [name]: merged },
		};

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

export const createProjectPlugin = async (
	spec: IProjectPluginSpec,
	options: IProjectPluginOptions,
): Promise<IProjectPluginResult> => projectPluginInternal(spec, options);

const projectPluginInternal = async (
	spec: IProjectPluginSpec,
	options: IProjectPluginOptions,
): Promise<IProjectPluginResult> => {
	if (!isAbsolute(options.workspaceRoot)) {
		throw new Error(
			`createProjectPlugin: workspaceRoot must be an absolute path, got "${options.workspaceRoot}"`,
		);
	}
	if (!spec.name.trim()) {
		throw new Error(
			'createProjectPlugin: spec.name must be a non-empty string',
		);
	}

	const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILENAME;
	const { id, files } = generatePluginFiles(spec);
	const pluginDir = options.pluginsRoot
		? join(options.workspaceRoot, options.pluginsRoot, id)
		: join(
				options.workspaceRoot,
				'packages/delendai/plugins',
				`delendai_${id}`,
			);

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
		`Restart the delendai host (or your editor's MCP server) to load it; ` +
		`its tools (${tools.join(', ')}) will appear under the "${prefix}" namespace. ` +
		`No delendai internals need to be read — edit ${toPosix(join(relative(options.workspaceRoot, pluginDir), 'src/index.ts'))} to fill in each tool's logic.`;

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

export const repairProjectPlugin = async (
	spec: IProjectPluginSpec,
	options: IProjectPluginOptions,
): Promise<IRepairProjectPluginResult> => {
	const result = await projectPluginInternal(spec, options);
	const repaired = result.files.written;
	const preserved = result.files.kept;
	const registrationState =
		result.registration.action === 'unchanged'
			? 'already pointed at the repaired plugin'
			: `registration ${result.registration.action}`;
	const report =
		repaired.length === 0 && preserved.length > 0
			? `Plugin "${result.name}" was already scaffolded; preserved ${preserved.length} existing file(s) and ${registrationState}.`
			: `Plugin "${result.name}" repaired: created ${repaired.length} missing file(s), preserved ${preserved.length} existing file(s), and ${registrationState}.`;

	return {
		...result,
		repaired,
		preserved,
		report,
	};
};
