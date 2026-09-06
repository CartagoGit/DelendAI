import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

export interface ILegacyWorkspaceFixtureOptions {
	readonly workspaceRoot: string;
	readonly homeRoot?: string;
	readonly foreignWorkspaceRoot?: string;
	readonly packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn' | 'none';
	readonly partial?: boolean;
	readonly dirtyWorkspace?: boolean;
	readonly includeGlobalHostConfigs?: boolean;
	readonly includeExtensionManifest?: boolean;
	readonly includeAgentFiles?: boolean;
}

export interface ILegacyWorkspaceFixture {
	readonly workspaceRoot: string;
	readonly homeRoot?: string;
	readonly foreignWorkspaceRoot?: string;
	readonly ownedClaudeConfigPath?: string;
	readonly ownedCodexConfigPath?: string;
	readonly packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn' | 'none';
}

const json = (value: unknown): string =>
	`${JSON.stringify(value, null, '\t')}\n`;

const ensureParent = async (absolutePath: string): Promise<void> => {
	const path = await import('node:path');
	await mkdir(path.dirname(absolutePath), { recursive: true });
};

const write = async (absolutePath: string, contents: string): Promise<void> => {
	await ensureParent(absolutePath);
	await writeFile(absolutePath, contents, 'utf8');
};

const lockfileNameFor = (
	packageManager: ILegacyWorkspaceFixture['packageManager'],
): string | null => {
	switch (packageManager) {
		case 'bun':
			return 'bun.lock';
		case 'npm':
			return 'package-lock.json';
		case 'pnpm':
			return 'pnpm-lock.yaml';
		case 'yarn':
			return 'yarn.lock';
		case 'none':
			return null;
	}
};

const lockfileContentsFor = (
	packageManager: ILegacyWorkspaceFixture['packageManager'],
): string => {
	switch (packageManager) {
		case 'bun':
			return '{"lockfileVersion":1,"packages":{"@mcp-vertex/core":"workspace:*"}}\n';
		case 'npm':
			return '{"name":"mcp-vertex-demo","lockfileVersion":3,"packages":{"":{"name":"mcp-vertex-demo"},"node_modules/@mcp-vertex/core":{"version":"0.1.0"}}}\n';
		case 'pnpm':
			return 'lockfileVersion: 9\npackages:\n  "@mcp-vertex/core@workspace:*":\n    resolution: {directory: packages/core}\n';
		case 'yarn':
			return '"@mcp-vertex/core@workspace:*":\n  version "0.1.0"\n';
		case 'none':
			return '';
	}
};

export const createLegacyWorkspaceFixture = async (
	options: ILegacyWorkspaceFixtureOptions,
): Promise<ILegacyWorkspaceFixture> => {
	const packageManager = options.packageManager ?? 'bun';
	const foreignWorkspaceRoot =
		options.foreignWorkspaceRoot ??
		join(options.workspaceRoot, '..', 'foreign-workspace');

	await mkdir(options.workspaceRoot, { recursive: true });
	await write(
		join(options.workspaceRoot, 'delendai.config.json'),
		[
			'{',
			'\t// legacy workspace fixture',
			'\t"name": "mcp-vertex",',
			'\t"namespace": "mcp-vertex.tools",',
			'\t"plugins": {',
			'\t\t"git": { "label": "mcp-vertex-git" }',
			'\t}',
			'}',
			'',
		].join('\n'),
	);

	await write(
		join(options.workspaceRoot, 'package.json'),
		json({
			name: options.partial ? 'delendai-demo' : 'mcp-vertex-demo',
			version: '0.1.0',
			dependencies: options.partial
				? { '@delendai/core': 'workspace:*' }
				: { '@mcp-vertex/core': 'workspace:*' },
			devDependencies: { '@mcp-vertex/cli': 'workspace:*' },
			scripts: {
				start: options.partial
					? 'delendai doctor'
					: 'mcp-vertex doctor',
				bridge: 'mcpv status',
			},
			workspaces: ['packages/mcp-vertex-core', 'apps/shared'],
		}),
	);

	const lockfileName = lockfileNameFor(packageManager);
	if (lockfileName !== null) {
		await write(
			join(options.workspaceRoot, lockfileName),
			lockfileContentsFor(packageManager),
		);
	}

	await write(
		join(options.workspaceRoot, '.vscode', 'mcp.json'),
		json({
			servers: {
				'mcp-vertex': {
					type: 'stdio',
					command: options.partial ? 'delendai' : 'mcp-vertex',
					args: [
						'-y',
						'@mcp-vertex/core',
						join(options.workspaceRoot, 'delendai.config.json'),
					],
					cwd: options.workspaceRoot,
					env: {
						MCP_VERTEX_HOME: join(
							options.workspaceRoot,
							'.cache',
							'delendai',
						),
					},
				},
			},
		}),
	);

	await write(
		join(options.workspaceRoot, '.cache', 'delendai', 'state.json'),
		json({
			owner: 'workspace',
			status: 'legacy',
		}),
	);
	await write(
		join(options.workspaceRoot, 'docs', 'delendai', 'guide.md'),
		'# Workspace guide\n\nThis fixture keeps docs neutral so the residual scanner can go green.\n',
	);

	if (options.includeAgentFiles ?? true) {
		await write(
			join(
				options.workspaceRoot,
				'.github',
				'agents',
				'workspace-helper.md',
			),
			'---\nname: mcp-vertex-helper\ndescription: Routes mcp-vertex tools\nmodel: mcp-vertex-large\n---\n\nUse mcp-vertex_* tools here.\n',
		);
		await write(
			join(
				options.workspaceRoot,
				'.claude',
				'agents',
				'workspace-helper.md',
			),
			'---\nname: mcp-vertex-helper\ndescription: Routes mcp-vertex tools\n---\n\nUse mcp-vertex commands here.\n',
		);
		await write(
			join(
				options.workspaceRoot,
				'.codex',
				'agents',
				'workspace-helper.md',
			),
			'---\nname: mcp-vertex-helper\ndescription: Routes mcp-vertex tools\n---\n\nUse mcp-vertex commands here.\n',
		);
	}

	if (options.includeExtensionManifest ?? true) {
		await write(
			join(options.workspaceRoot, 'extensions', 'vscode', 'package.json'),
			json({
				name: 'mcp-vertex-vscode',
				displayName: 'MCP Vertex for VS Code',
				description: 'VS Code host for mcp-vertex.',
				version: '0.1.0',
				publisher: 'cartago',
				activationEvents: [
					'workspaceContains:**/mcp-vertex.config.json',
				],
				contributes: {
					commands: [
						{
							command: 'mcp-vertex.openOverview',
							title: 'Open Overview',
							category: 'MCP Vertex',
						},
					],
				},
			}),
		);
	}

	if (options.dirtyWorkspace === true) {
		await write(
			join(options.workspaceRoot, 'src', 'dirty-user-note.ts'),
			'export const dirtyUserNote = "keep me";\n',
		);
	}

	let ownedClaudeConfigPath: string | undefined;
	let ownedCodexConfigPath: string | undefined;
	if (
		options.includeGlobalHostConfigs === true &&
		options.homeRoot !== undefined
	) {
		ownedClaudeConfigPath = join(options.homeRoot, '.claude.json');
		ownedCodexConfigPath = join(options.homeRoot, '.codex', 'config.toml');
		await write(
			ownedClaudeConfigPath,
			json({
				projects: {
					[options.workspaceRoot]: {
						mcpServers: {
							'mcp-vertex': {
								command: 'mcp-vertex',
								cwd: options.workspaceRoot,
								args: [
									join(
										options.workspaceRoot,
										'delendai.config.json',
									),
								],
							},
						},
					},
					[foreignWorkspaceRoot]: {
						mcpServers: {
							'mcp-vertex': {
								command: 'mcp-vertex',
								cwd: foreignWorkspaceRoot,
							},
						},
					},
				},
			}),
		);
		await write(
			ownedCodexConfigPath,
			[
				`[projects."${options.workspaceRoot}"]`,
				'trust_level = "trusted"',
				`command = "mcp-vertex --config ${join(options.workspaceRoot, 'delendai.config.json')}"`,
				'',
				`[projects."${foreignWorkspaceRoot}"]`,
				'trust_level = "trusted"',
				`command = "mcp-vertex --config ${join(foreignWorkspaceRoot, 'delendai.config.json')}"`,
				'',
			].join('\n'),
		);
	}

	return {
		workspaceRoot: options.workspaceRoot,
		homeRoot: options.homeRoot,
		foreignWorkspaceRoot,
		ownedClaudeConfigPath,
		ownedCodexConfigPath,
		packageManager,
	};
};

export const hashWorkspaceTree = async (root: string): Promise<string> => {
	const files: { readonly path: string; readonly contents: string }[] = [];
	const walk = async (dir: string): Promise<void> => {
		const { readdir } = await import('node:fs/promises');
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const absolute = join(dir, entry.name);
			const rel = relative(root, absolute).split('\\').join('/');
			if (entry.isDirectory()) {
				if (entry.name === '.git' || entry.name === 'node_modules')
					continue;
				await walk(absolute);
				continue;
			}
			if (!entry.isFile()) continue;
			files.push({
				path: rel,
				contents: await readFile(absolute, 'utf8'),
			});
		}
	};
	await walk(root);
	files.sort((left, right) => left.path.localeCompare(right.path));
	return createHash('sha256')
		.update(
			files.map((file) => `${file.path}\0${file.contents}`).join('\n'),
		)
		.digest('hex');
};
