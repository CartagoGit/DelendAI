import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import { toKebabCase } from '../shared/string-normalize';
import { toolError, toolJson } from '../shared/tool-response';
import { withFileMutex } from '../shared/with-file-mutex';
import { scaffoldPluginFiles } from './scaffold-host';

export const AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA = z
	.object({
		name: z.string().trim().min(1).describe('Plugin name or id.'),
		description: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe('Optional one-line plugin description.'),
		namespace: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe('Optional tool namespace prefix.'),
		mode: z.enum(['create', 'inspect', 'repair']).optional(),
		dryRun: z.boolean().optional(),
		keepLegacy: z.boolean().optional(),
	})
	.strict();

const FILE_SCHEMA = z.object({ path: z.string(), content: z.string() });
const REGISTRATION_SCHEMA = z.object({
	configFile: z.string(),
	path: z.string(),
	action: z.enum(['added', 'updated', 'unchanged']),
	previousPath: z.string().optional(),
});
const DIAGNOSTIC_SCHEMA = z.object({
	id: z.string(),
	severity: z.enum(['error', 'warning', 'info']),
	path: z.string(),
	message: z.string(),
	action: z.string(),
	autoFixable: z.boolean(),
});

export const AUTHOR_EXTERNAL_PLUGIN_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	name: z.string().optional(),
	namespace: z.string().optional(),
	pluginDir: z.string().optional(),
	pluginPath: z.string().optional(),
	files: z
		.object({
			written: z.array(z.string()),
			preserved: z.array(z.string()),
			moved: z.array(z.string()),
			planned: z.array(FILE_SCHEMA),
		})
		.optional(),
	registration: REGISTRATION_SCHEMA.optional(),
	diagnostics: z.array(DIAGNOSTIC_SCHEMA).optional(),
	autoFixed: z.array(z.string()).optional(),
	nextSteps: z.string().optional(),
});

export type IAuthorExternalPluginArgs = z.input<
	typeof AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA
>;
export type IAuthorExternalPluginOutput = z.infer<
	typeof AUTHOR_EXTERNAL_PLUGIN_OUTPUT_SCHEMA
>;

export interface IAuthorExternalPluginOptions {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly configFileName?: string;
	readonly pluginsRoot?: string;
}

interface IAuthorExternalPluginFiles {
	readonly written: readonly string[];
	readonly preserved: readonly string[];
	readonly moved: readonly string[];
	readonly planned: readonly { path: string; content: string }[];
}

type PluginDiagnostic = z.infer<typeof DIAGNOSTIC_SCHEMA>;

const configFileName = (options: IAuthorExternalPluginOptions): string =>
	options.configFileName ?? 'mcp-vertex.config.json';

const pluginIdFor = (name: string): string => {
	const id = toKebabCase(name);
	if (id.length === 0) {
		throw new Error(
			'plugin name must resolve to a non-empty kebab-case id',
		);
	}
	return id;
};

const defaultPluginRoot = (options: IAuthorExternalPluginOptions): string =>
	options.pluginsRoot ?? 'packages/mcp-vertex/plugins';

const pathExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const readTextIfExists = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return undefined;
	}
};

const structuralDiagnostics = async (
	pluginDir: string,
	files: readonly { path: string; content: string }[],
): Promise<PluginDiagnostic[]> => {
	const diagnostics: PluginDiagnostic[] = [];
	for (const file of files) {
		const absolutePath = join(
			pluginDir,
			file.path.replace(/^plugins\/[^/]+\//u, ''),
		);
		if (!(await pathExists(absolutePath))) {
			diagnostics.push({
				id: `missing-${file.path}`,
				severity: 'error',
				path: absolutePath,
				message: 'Required scaffold file is missing.',
				action: 'Create it from the canonical plugin scaffold.',
				autoFixable: true,
			});
		}
	}

	const indexPath = join(pluginDir, 'src/index.ts');
	const indexText = await readTextIfExists(indexPath);
	if (indexText !== undefined) {
		const checks: readonly [string, string, string][] = [
			[
				'default-export',
				'export default',
				'Export the plugin with `export default definePlugin(...)`.',
			],
			[
				'define-plugin',
				'definePlugin(',
				'Create the plugin through the mcp-vertex `definePlugin` contract.',
			],
			['register-hook', 'register(', 'Provide the plugin register hook.'],
			[
				'tool-registration',
				'registerTool(',
				'Register each tool through the MCP server registration API.',
			],
			[
				'tool-output-schema',
				'outputSchema:',
				'Declare an outputSchema for every registered tool.',
			],
		];
		for (const [id, marker, action] of checks) {
			if (!indexText.includes(marker)) {
				diagnostics.push({
					id,
					severity: 'error',
					path: indexPath,
					message: `Plugin entrypoint is missing the structural marker ${marker}.`,
					action,
					autoFixable: false,
				});
			}
		}
	}

	const packagePath = join(pluginDir, 'package.json');
	const packageText = await readTextIfExists(packagePath);
	if (packageText !== undefined) {
		try {
			const packageJson = JSON.parse(packageText) as Record<
				string,
				unknown
			>;
			const requiredEntries: readonly [string, string][] = [
				['main', './src/index.ts'],
				['type', 'module'],
				['scripts.typecheck', 'tsc --noEmit -p tsconfig.json'],
			];
			for (const [id, expected] of requiredEntries) {
				const separator = id.indexOf('.');
				const head = separator >= 0 ? id.slice(0, separator) : id;
				const tail =
					separator >= 0 ? id.slice(separator + 1) : undefined;
				const nested = packageJson[head];
				let actual: unknown = nested;
				if (
					tail !== undefined &&
					typeof nested === 'object' &&
					nested !== null
				) {
					actual = (nested as Record<string, unknown>)[tail];
				}
				if (actual !== expected) {
					diagnostics.push({
						id: `package-${id}`,
						severity: 'error',
						path: packagePath,
						message: `package.json must contain ${id}=${JSON.stringify(expected)}.`,
						action: 'Repair the package metadata without changing the plugin implementation.',
						autoFixable: true,
					});
				}
			}
		} catch {
			diagnostics.push({
				id: 'package-json-invalid',
				severity: 'error',
				path: packagePath,
				message: 'package.json is not valid JSON.',
				action: 'Repair the JSON manually or remove it and rerun create with keepLegacy enabled.',
				autoFixable: false,
			});
		}
	}
	return diagnostics;
};

const relativePluginPath = (workspaceRoot: string, pluginDir: string): string =>
	`${relative(workspaceRoot, join(pluginDir, 'src/index.ts')).replaceAll('\\', '/')}`;

const readConfig = async (
	workspace: IWorkspacePathProvider,
	path: string,
): Promise<Record<string, unknown>> => {
	if (!(await pathExists(workspace.resolve(path)))) return {};
	const text = await readFile(workspace.resolve(path), 'utf8');
	const parsed: unknown = JSON.parse(text);
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		throw new Error(`${path} must contain a JSON object`);
	}
	return parsed as Record<string, unknown>;
};

const registerPluginPath = async (
	options: IAuthorExternalPluginOptions,
	pluginId: string,
	pluginPath: string,
	dryRun: boolean,
): Promise<z.infer<typeof REGISTRATION_SCHEMA>> => {
	const file = configFileName(options);
	const absolute = options.workspace.resolve(file);
	const config = await readConfig(options.workspace, file);
	const plugins =
		config.plugins !== undefined &&
		typeof config.plugins === 'object' &&
		config.plugins !== null &&
		!Array.isArray(config.plugins)
			? (config.plugins as Record<string, unknown>)
			: {};
	const previous = plugins[pluginId];
	const previousPath =
		previous !== null &&
		typeof previous === 'object' &&
		!Array.isArray(previous) &&
		typeof (previous as Record<string, unknown>).path === 'string'
			? ((previous as Record<string, unknown>).path as string)
			: undefined;
	const action =
		previousPath === pluginPath
			? 'unchanged'
			: previousPath === undefined
				? 'added'
				: 'updated';
	if (!dryRun && action !== 'unchanged') {
		const nextConfig = {
			...config,
			plugins: {
				...plugins,
				[pluginId]: {
					...(previous !== null &&
					typeof previous === 'object' &&
					!Array.isArray(previous)
						? previous
						: {}),
					path: pluginPath,
				},
			},
		};
		await withFileMutex(absolute, () =>
			writeFileAtomic(
				absolute,
				`${JSON.stringify(nextConfig, null, '\t')}\n`,
			),
		);
	}
	return {
		configFile: absolute,
		path: pluginPath,
		action,
		...(previousPath !== undefined ? { previousPath } : {}),
	};
};

const writePluginFiles = async (
	pluginDir: string,
	files: readonly { path: string; content: string }[],
	keepLegacy: boolean,
	mode: 'create' | 'repair',
	dryRun: boolean,
): Promise<IAuthorExternalPluginFiles> => {
	const written: string[] = [];
	const preserved: string[] = [];
	const moved: string[] = [];
	const planned = files.map((file) => ({
		path: join(
			pluginDir,
			file.path.replace(/^plugins\/[^/]+\//u, ''),
		).replaceAll('\\', '/'),
		content: file.content,
	}));
	if (dryRun) return { written, preserved, moved, planned };
	for (const file of planned) {
		if (await pathExists(file.path)) {
			if (mode === 'repair') {
				preserved.push(file.path);
				continue;
			}
			if (!keepLegacy) {
				throw new Error(
					`plugin scaffold target already exists: ${file.path}; use mode:"repair" or keepLegacy:true`,
				);
			}
			const legacy = `${file.path}.legacy`;
			await writeFileAtomic(legacy, await readFile(file.path, 'utf8'));
			moved.push(legacy);
		}
		await writeFileAtomic(file.path, file.content);
		written.push(file.path);
	}
	return { written, preserved, moved, planned };
};

const repairPackageMetadata = async (
	pluginDir: string,
	files: readonly { path: string; content: string }[],
	dryRun: boolean,
): Promise<string | undefined> => {
	const packagePath = join(pluginDir, 'package.json');
	const packageTemplate = files.find((file) =>
		file.path.endsWith('/package.json'),
	);
	if (packageTemplate === undefined || !(await pathExists(packagePath))) {
		return undefined;
	}
	let current: Record<string, unknown>;
	try {
		current = JSON.parse(await readFile(packagePath, 'utf8')) as Record<
			string,
			unknown
		>;
	} catch {
		return undefined;
	}
	const template = JSON.parse(packageTemplate.content) as Record<
		string,
		unknown
	>;
	const currentScripts =
		current.scripts !== null && typeof current.scripts === 'object'
			? (current.scripts as Record<string, unknown>)
			: {};
	const next = {
		...current,
		main: template.main,
		type: template.type,
		scripts: {
			...currentScripts,
			typecheck: (template.scripts as Record<string, unknown>).typecheck,
		},
	};
	if (
		current.main === next.main &&
		current.type === next.type &&
		currentScripts.typecheck ===
			(next.scripts as Record<string, unknown>).typecheck
	) {
		return undefined;
	}
	if (!dryRun) {
		await writeFileAtomic(
			packagePath,
			`${JSON.stringify(next, null, '\t')}\n`,
		);
	}
	return packagePath;
};

export const authorExternalPlugin = async (
	args: IAuthorExternalPluginArgs,
	options: IAuthorExternalPluginOptions,
): Promise<IAuthorExternalPluginOutput> => {
	const pluginId = pluginIdFor(args.name);
	const namespace = args.namespace ?? pluginId;
	const description = args.description ?? `TODO: describe ${pluginId}.`;
	const pluginDir = options.workspace.resolve(
		`${defaultPluginRoot(options)}/mcp-vertex_${pluginId}`,
	);
	const files = scaffoldPluginFiles({
		pluginName: pluginId,
		description,
	});
	const dryRun = args.dryRun ?? false;
	const diagnostics = await structuralDiagnostics(pluginDir, files);
	if ((args.mode ?? 'create') === 'inspect') {
		return {
			ok: diagnostics.every(
				(diagnostic) => diagnostic.severity !== 'error',
			),
			name: pluginId,
			namespace,
			pluginDir,
			pluginPath: relativePluginPath(options.workspace.root, pluginDir),
			diagnostics,
			nextSteps:
				diagnostics.length === 0
					? 'Plugin structure is valid.'
					: 'Apply the auto-fixable findings, then address the remaining structural findings in the plugin entrypoint.',
		};
	}
	const writeMode: 'create' | 'repair' =
		args.mode === 'repair' ? 'repair' : 'create';
	const fileResult = await writePluginFiles(
		pluginDir,
		files,
		args.keepLegacy ?? false,
		writeMode,
		dryRun,
	);
	const repairedMetadata =
		writeMode === 'repair'
			? await repairPackageMetadata(pluginDir, files, dryRun)
			: undefined;
	const pluginPath = relativePluginPath(options.workspace.root, pluginDir);
	const registration = await registerPluginPath(
		options,
		pluginId,
		pluginPath,
		dryRun,
	);
	const afterDiagnostics = await structuralDiagnostics(pluginDir, files);
	const autoFixed = diagnostics
		.filter(
			(diagnostic) =>
				fileResult.written.some((path) => path === diagnostic.path) ||
				(repairedMetadata !== undefined &&
					diagnostic.path === repairedMetadata),
		)
		.map((diagnostic) => diagnostic.id);
	const toolName = `${namespace}_ping`;
	return {
		ok: true,
		name: pluginId,
		namespace,
		pluginDir,
		pluginPath,
		files: {
			written: [...fileResult.written],
			preserved: [...fileResult.preserved],
			moved: [...fileResult.moved],
			planned: fileResult.planned.map((file) => ({ ...file })),
		},
		registration,
		diagnostics: afterDiagnostics,
		autoFixed,
		nextSteps: `Restart the MCP host to load plugins.${pluginId}.path; the generated plugin exposes ${toolName}.`,
	};
};

export const buildAuthorExternalPluginToolRegistration = (
	options: IAuthorExternalPluginOptions,
): IToolRegistration => ({
	id: 'author_plugin',
	summary: 'Create or repair an external plugin and register its local path.',
	tags: ['bootstrap', 'write'],
	effects: ['write'],
	dryRunSupported: true,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_author_plugin`,
			{
				description:
					'Create or repair a project-owned plugin under packages/mcp-vertex/plugins/mcp-vertex_<name> and register plugins.<name>.path in the project config.',
				inputSchema: AUTHOR_EXTERNAL_PLUGIN_INPUT_SCHEMA,
				outputSchema: AUTHOR_EXTERNAL_PLUGIN_OUTPUT_SCHEMA,
			},
			async (args: IAuthorExternalPluginArgs) => {
				try {
					return toolJson(await authorExternalPlugin(args, options));
				} catch (error) {
					return toolError(
						error instanceof Error ? error.message : String(error),
						'Check the plugin name, project config JSON, and workspace permissions, then retry.',
					);
				}
			},
		);
	},
});
