import { spawn } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import type { IPluginWiringFs } from '../contracts/interfaces/plugin-wiring.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import {
	createFileSystemBatchWriter,
	type IBatchAtomicWriter,
} from '../shared/batch-atomic-writer';
import { toolJson } from '../shared/tool-response';
import { diagnosePluginWiring } from './diagnose-plugin-wiring';
import { scaffoldPluginFiles } from './scaffold-host';
import { wirePluginIntoMonorepo } from './wire-plugin';

const kebabCase = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

const PLUGIN_WIRING_POINT_ID_SCHEMA = z.enum([
	'tsconfig-base',
	'vitest-shared',
	'plugin-defaults',
	'publish-order',
	'preset-catalog',
	'catalog-regen',
]);

const PLUGIN_WIRING_EDIT_SCHEMA = z.object({
	path: z.string(),
	previous: z.string(),
	next: z.string(),
	noop: z.boolean(),
});

const PLUGIN_WIRING_WRITE_SCHEMA = z.object({
	pointId: PLUGIN_WIRING_POINT_ID_SCHEMA,
	edits: z.array(PLUGIN_WIRING_EDIT_SCHEMA),
	wired: z.boolean(),
});

const PLUGIN_WIRING_POINT_SCHEMA = z.object({
	id: PLUGIN_WIRING_POINT_ID_SCHEMA,
	path: z.string(),
	wired: z.boolean(),
	summary: z.string(),
	remediation: z.string().optional(),
});

const PLUGIN_WIRING_REPORT_SCHEMA = z.object({
	pluginId: z.string(),
	points: z.array(PLUGIN_WIRING_POINT_SCHEMA),
	fullyWired: z.boolean(),
	missing: z.array(PLUGIN_WIRING_POINT_ID_SCHEMA),
});

export const CREATE_PLUGIN_INPUT_SCHEMA = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.refine((value) => kebabCase(value).length > 0, {
			message: 'name must resolve to a non-empty kebab-case plugin id',
		})
		.describe('Plugin name or id; normalized to kebab-case.'),
	description: z.string().trim().min(1),
	sampleToolId: z.string().trim().min(1).optional(),
	dryRun: z.boolean().optional(),
});

export const CREATE_PLUGIN_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	scaffolded: z.object({
		files: z.array(z.string()),
	}),
	wired: z.array(PLUGIN_WIRING_WRITE_SCHEMA),
	doctor: PLUGIN_WIRING_REPORT_SCHEMA,
	pluginId: z.string(),
});

export type ICreatePluginArgs = z.infer<typeof CREATE_PLUGIN_INPUT_SCHEMA>;
export type ICreatePluginOutput = z.infer<typeof CREATE_PLUGIN_OUTPUT_SCHEMA>;

export interface ICreatePluginToolOptions {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly fs?: IPluginWiringFs;
	readonly batchWriter?: IBatchAtomicWriter;
	readonly regenerateCatalog?: (
		args: IRegenerateCatalogArgs,
	) => Promise<void>;
}

export interface IRegenerateCatalogArgs {
	readonly pluginId: string;
	readonly fs: IPluginWiringFs;
	readonly workspaceRoot: string;
	readonly sampleToolId: string;
	readonly dryRun: boolean;
}

const normalizeWired = (
	wired: readonly {
		readonly pointId: string;
		readonly edits: readonly {
			readonly path: string;
			readonly previous: string;
			readonly next: string;
			readonly noop: boolean;
		}[];
		readonly wired: boolean;
	}[],
): ICreatePluginOutput['wired'] =>
	wired.map((entry) => ({
		pointId:
			entry.pointId as ICreatePluginOutput['wired'][number]['pointId'],
		edits: entry.edits.map((edit) => ({ ...edit })),
		wired: entry.wired,
	}));

const normalizeDoctor = (report: {
	readonly pluginId: string;
	readonly points: readonly {
		readonly id: string;
		readonly path: string;
		readonly wired: boolean;
		readonly summary: string;
		readonly remediation?: string;
	}[];
	readonly fullyWired: boolean;
	readonly missing: readonly string[];
}): ICreatePluginOutput['doctor'] => ({
	pluginId: report.pluginId,
	points: report.points.map((point) => ({
		id: point.id as ICreatePluginOutput['doctor']['points'][number]['id'],
		path: point.path,
		wired: point.wired,
		summary: point.summary,
		...(point.remediation !== undefined
			? { remediation: point.remediation }
			: {}),
	})),
	fullyWired: report.fullyWired,
	missing: [
		...report.missing.map(
			(id) => id as ICreatePluginOutput['doctor']['missing'][number],
		),
	],
});

const createWorkspaceFs = (
	workspace: IWorkspacePathProvider,
): IPluginWiringFs => ({
	async readFile(path) {
		return readFile(workspace.resolve(path), 'utf8');
	},
	async writeFile(path, content) {
		await writeFile(workspace.resolve(path), content, 'utf8');
	},
	async pathExists(path) {
		try {
			await stat(workspace.resolve(path));
			return true;
		} catch {
			return false;
		}
	},
});

const createOverlayFs = (baseFs: IPluginWiringFs): IPluginWiringFs => {
	const overlay = new Map<string, string>();
	return {
		async readFile(path) {
			const fromOverlay = overlay.get(path);
			if (fromOverlay !== undefined) return fromOverlay;
			return baseFs.readFile(path);
		},
		async writeFile(path, content) {
			overlay.set(path, content);
		},
		async pathExists(path) {
			return overlay.has(path) || (await baseFs.pathExists(path));
		},
	};
};

const appendSyntheticCatalogEntry = async ({
	pluginId,
	fs,
	sampleToolId,
}: IRegenerateCatalogArgs): Promise<void> => {
	const path = 'docs/mcp-vertex/agent-catalog.generated.json';
	const parsed = JSON.parse(await fs.readFile(path)) as {
		tools?: Array<Record<string, unknown>>;
		[key: string]: unknown;
	};
	const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
	if (!tools.some((tool) => tool.plugin === pluginId)) {
		tools.push({
			name: `${pluginId}_${sampleToolId.replace(/-/gu, '_')}`,
			plugin: pluginId,
		});
	}
	parsed.tools = tools;
	await fs.writeFile(path, JSON.stringify(parsed, null, '\t'));
};

const runCatalogGenerate = async (workspaceRoot: string): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		const child = spawn('bun', ['run', 'catalog:generate'], {
			cwd: workspaceRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stderr = '';
		let stdout = '';
		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					stderr.trim().length > 0
						? stderr.trim()
						: stdout.trim().length > 0
							? stdout.trim()
							: `bun run catalog:generate failed with exit code ${code ?? 'unknown'}`,
				),
			);
		});
	});
};

const defaultRegenerateCatalog = async (
	args: IRegenerateCatalogArgs,
): Promise<void> => {
	if (args.dryRun) {
		await appendSyntheticCatalogEntry(args);
		return;
	}
	await runCatalogGenerate(args.workspaceRoot);
};

const assertScaffoldTargetsAvailable = async (
	paths: readonly string[],
	fs: IPluginWiringFs,
): Promise<void> => {
	for (const path of paths) {
		if (await fs.pathExists(path)) {
			throw new Error(`plugin scaffold target already exists: ${path}`);
		}
	}
};

export const runCreatePlugin = async (
	args: ICreatePluginArgs,
	options: Omit<ICreatePluginToolOptions, 'namespacePrefix'>,
): Promise<ICreatePluginOutput> => {
	const pluginId = kebabCase(args.name);
	if (pluginId.length === 0) {
		throw new Error(
			'plugin name must resolve to a non-empty kebab-case id',
		);
	}

	const dryRun = args.dryRun ?? false;
	const sampleToolId = args.sampleToolId ?? 'sample-tool';
	const scaffoldedFiles = scaffoldPluginFiles({
		pluginName: pluginId,
		description: args.description,
	});
	const scaffoldPaths = scaffoldedFiles.map((file) => file.path);
	const fs = options.fs ?? createWorkspaceFs(options.workspace);
	const regenerateCatalog =
		options.regenerateCatalog ?? defaultRegenerateCatalog;

	if (dryRun) {
		const previewFs = createOverlayFs(fs);
		for (const file of scaffoldedFiles) {
			await previewFs.writeFile(file.path, file.content);
		}
		const wired = await wirePluginIntoMonorepo({
			pluginId,
			fs: previewFs,
			dryRun: false,
		});
		await regenerateCatalog({
			pluginId,
			fs: previewFs,
			workspaceRoot: options.workspace.root,
			sampleToolId,
			dryRun: true,
		});
		const doctor = await diagnosePluginWiring(pluginId, previewFs);
		return {
			ok: doctor.fullyWired,
			scaffolded: { files: scaffoldPaths },
			wired: normalizeWired(wired),
			doctor: normalizeDoctor(doctor),
			pluginId,
		};
	}

	await assertScaffoldTargetsAvailable(scaffoldPaths, fs);
	const batchWriter =
		options.batchWriter ??
		createFileSystemBatchWriter(options.workspace.root);
	const batch = await batchWriter.writeAll(
		scaffoldedFiles.map((file) => ({
			path: file.path,
			content: file.content,
		})),
	);
	if (!batch.ok) {
		const detail = batch.errors
			.map((error) => `${error.path}: ${error.reason}`)
			.join('; ');
		throw new Error(
			detail.length > 0
				? `failed to scaffold plugin files: ${detail}`
				: 'failed to scaffold plugin files',
		);
	}

	const wired = await wirePluginIntoMonorepo({
		pluginId,
		fs,
		dryRun: false,
	});
	await regenerateCatalog({
		pluginId,
		fs,
		workspaceRoot: options.workspace.root,
		sampleToolId,
		dryRun: false,
	});
	const doctor = await diagnosePluginWiring(pluginId, fs);
	return {
		ok: doctor.fullyWired,
		scaffolded: { files: scaffoldPaths },
		wired: normalizeWired(wired),
		doctor: normalizeDoctor(doctor),
		pluginId,
	};
};

export const buildCreatePluginToolRegistration = (
	options: ICreatePluginToolOptions,
): IToolRegistration => ({
	id: 'create_plugin',
	summary:
		'Scaffold a new first-party plugin: writes the scaffold files, wires monorepo integration points, then self-checks via the wiring doctor.',
	tags: ['bootstrap'],
	effects: ['write', 'spawn'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_create_plugin`,
			{
				description:
					'Scaffold a new first-party plugin: writes the four scaffold files + wires it into tsconfig.base/vitest.shared/PLUGIN_DEFAULTS/publish-order/preset-catalog, then self-checks via the doctor. Returns the full report.',
				inputSchema: CREATE_PLUGIN_INPUT_SCHEMA,
				outputSchema: CREATE_PLUGIN_OUTPUT_SCHEMA,
			},
			async (args: ICreatePluginArgs) =>
				toolJson(
					await runCreatePlugin(args, {
						workspace: options.workspace,
						...(options.fs !== undefined ? { fs: options.fs } : {}),
						...(options.batchWriter !== undefined
							? { batchWriter: options.batchWriter }
							: {}),
						...(options.regenerateCatalog !== undefined
							? { regenerateCatalog: options.regenerateCatalog }
							: {}),
					}),
				),
		);
	},
});
