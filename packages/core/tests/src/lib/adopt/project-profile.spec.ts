import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWorkspaceFileReader } from '@mcp-vertex/core/lib/bootstrap/workspace-file-reader';
import { buildAdoptProjectToolRegistration } from '@mcp-vertex/core/lib/adopt/adopt-project.tool';
import {
	buildProjectProfile,
	loadProjectProfile,
	persistProjectProfile,
} from '@mcp-vertex/core/lib/adopt/project-profile.service';
import type { IToolRegistration } from '@mcp-vertex/core/public';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_name: string, _def: unknown, fn: typeof handler) => {
			handler = fn;
		},
	} as never);
	return handler!;
};

const parse = (response: { content: Array<{ text: string }> }): any =>
	JSON.parse(response.content[0]?.text ?? '{}');

const analysis = {
	hasPackageJson: true,
	name: 'acme',
	projectType: 'monorepo' as const,
	language: 'typescript' as const,
	packageManager: 'bun' as const,
	framework: 'astro',
	testRunner: 'vitest' as const,
	monorepoTool: 'bun-workspaces',
	hasMcpProject: false,
	mcpEvidence: [],
	ci: ['.github/workflows/ci.yml'],
	ciProvider: 'github-actions' as const,
	agentConfigs: ['AGENTS.md'],
	scripts: { test: 'vitest run' },
	docsConventions: ['README.md'],
	conflicts: ['.github/copilot-instructions.md'],
	signals: ['workspace:apps/web'],
};

const assessment = {
	recommendedPresetId: 'swarm',
	recommendedPluginIds: ['git', 'search', 'quality'],
	pluginRecommendations: [],
	conflicts: [],
	cost: {
		presetId: 'swarm',
		schemaBytes: 42,
		estimatedTokens: 11,
		recommendedPluginCount: 3,
		source: 'preset-budget' as const,
		surfaceMode: 'native' as const,
		runtimeSurface: 'managed' as const,
		note: 'fixture',
	},
	summary: {
		projectType: analysis.projectType,
		language: analysis.language,
		packageManager: analysis.packageManager,
		ciProvider: analysis.ciProvider,
		docsConventions: ['README.md'],
	},
};

describe('project-profile service (f00280 S1)', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'project-profile-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('builds a profile and preserves non-root workspace entries on regeneration', () => {
		const existing = {
			version: 1 as const,
			createdAt: '2026-08-01T00:00:00.000Z',
			generatedAt: '2026-08-02T00:00:00.000Z',
			projectName: 'old-name',
			projectType: 'monorepo' as const,
			language: 'typescript' as const,
			packageManager: 'bun' as const,
			framework: 'react',
			testRunner: 'vitest' as const,
			monorepoTool: 'bun-workspaces',
			hasMcpProject: false,
			mcpEvidence: [],
			ci: [],
			ciProvider: 'unknown' as const,
			agentConfigs: [],
			docsConventions: [],
			conflicts: [],
			signals: [],
			recommendedPresetId: 'swarm',
			recommendedPluginIds: ['git'],
			workspaces: [
				{
					path: '.',
					projectType: 'monorepo' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'react',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['git'],
				},
				{
					path: 'apps/web',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
				{
					path: 'apps/web/',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
				{
					path: 'apps\\web',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
			],
		};

		const profile = buildProjectProfile({
			analysis,
			assessment,
			existing,
			discoveredWorkspaces: [
				{
					path: 'apps/web',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
			],
			now: new Date('2026-08-31T12:00:00.000Z'),
		});

		expect(profile.createdAt).toBe(existing.createdAt);
		expect(profile.generatedAt).toBe('2026-08-31T12:00:00.000Z');
		expect(profile.projectName).toBe('acme');
		expect(profile.recommendedPluginIds).toEqual([
			'git',
			'search',
			'quality',
		]);
		expect(profile.workspaces).toHaveLength(2);
		expect(profile.workspaces[0]).toMatchObject({
			path: '.',
			framework: 'astro',
			recommendedPluginIds: ['git', 'search', 'quality'],
		});
		expect(profile.workspaces[1]).toMatchObject({
			path: 'apps/web',
			recommendedPluginIds: ['docs'],
		});
	});

	it('builds a profile from discovered workspaces on first persistence', () => {
		const profile = buildProjectProfile({
			analysis,
			assessment,
			discoveredWorkspaces: [
				{
					path: 'apps/shared',
					projectType: 'library' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['search'],
				},
				{
					path: 'apps/web/',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
				{
					path: 'apps\\web',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
				{
					path: 'apps/web',
					projectType: 'webapp' as const,
					language: 'typescript' as const,
					packageManager: 'bun' as const,
					framework: 'astro',
					testRunner: 'vitest' as const,
					recommendedPluginIds: ['docs'],
				},
			],
			now: new Date('2026-08-31T12:00:00.000Z'),
		});

		expect(profile.workspaces).toHaveLength(3);
		expect(profile.workspaces[1]).toMatchObject({ path: 'apps/shared' });
		expect(profile.workspaces[2]).toMatchObject({
			path: 'apps/web',
			framework: 'astro',
		});
	});

	it('quarantines corrupt persisted state and rewrites a fresh profile', async () => {
		const workspace = createWorkspacePathProvider(root);
		mkdirSync(join(root, '.mcp-vertex'), { recursive: true });
		writeFileSync(
			join(root, '.mcp-vertex/project-profile.json'),
			'{ not valid json',
			'utf8',
		);

		const before = await loadProjectProfile(workspace);
		expect(before.profile).toBeUndefined();
		expect(before.corruptBackupPath).not.toBeNull();
		expect(existsSync(before.corruptBackupPath ?? '')).toBe(true);

		const persisted = await persistProjectProfile({
			workspace,
			analysis,
			assessment,
			now: new Date('2026-08-31T12:00:00.000Z'),
		});

		expect(persisted.created).toBe(true);
		expect(persisted.corruptBackupPath).toBeNull();
		const written = JSON.parse(
			await readFile(
				join(root, '.mcp-vertex/project-profile.json'),
				'utf8',
			),
		);
		expect(written.projectName).toBe('acme');
		expect(written.workspaces[0].path).toBe('.');
	});

	it('adopt_project write:true persists and incrementally refreshes the project profile', async () => {
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'fixture',
				workspaces: ['apps/*'],
				scripts: { test: 'vitest run' },
				devDependencies: { astro: '^5.0.0', vitest: '^3.0.0' },
			}),
			'utf8',
		);
		mkdirSync(join(root, 'apps/web'), { recursive: true });
		writeFileSync(
			join(root, 'apps/web/package.json'),
			JSON.stringify({
				name: '@fixture/web',
				dependencies: { astro: '^5.0.0' },
				devDependencies: { vitest: '^3.0.0' },
				scripts: { test: 'vitest run' },
			}),
			'utf8',
		);
		mkdirSync(join(root, 'packages/team/apps/docs'), { recursive: true });
		writeFileSync(
			join(root, 'packages/team/apps/docs/package.json'),
			JSON.stringify({
				name: '@fixture/docs',
				devDependencies: { vitest: '^3.0.0' },
				scripts: { test: 'vitest run' },
			}),
			'utf8',
		);
		const packageJson = JSON.parse(
			readFileSync(join(root, 'package.json'), 'utf8'),
		) as Record<string, unknown>;
		packageJson.workspaces = ['apps/*', 'packages/**/apps/*'];
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify(packageJson),
			'utf8',
		);
		mkdirSync(join(root, 'apps/old'), { recursive: true });
		mkdirSync(join(root, '.mcp-vertex'), { recursive: true });
		writeFileSync(
			join(root, '.mcp-vertex/project-profile.json'),
			JSON.stringify({
				version: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				generatedAt: '2026-08-02T00:00:00.000Z',
				projectName: 'fixture',
				projectType: 'monorepo',
				language: 'typescript',
				packageManager: 'bun',
				testRunner: 'vitest',
				hasMcpProject: false,
				mcpEvidence: [],
				ci: [],
				ciProvider: 'unknown',
				agentConfigs: [],
				docsConventions: [],
				conflicts: [],
				signals: [],
				recommendedPresetId: 'swarm',
				recommendedPluginIds: ['git'],
				workspaces: [
					{
						path: 'apps/old',
						projectType: 'library',
						language: 'typescript',
						packageManager: 'bun',
						testRunner: 'vitest',
						recommendedPluginIds: ['search'],
					},
					{
						path: 'apps/web',
						projectType: 'webapp',
						language: 'typescript',
						packageManager: 'bun',
						framework: 'astro',
						testRunner: 'vitest',
						recommendedPluginIds: ['docs'],
					},
				],
			}),
			'utf8',
		);

		const workspace = createWorkspacePathProvider(root);
		const adopt = await capture(
			buildAdoptProjectToolRegistration({
				namespacePrefix: 'mcp-vertex',
				workspace,
				corePaths: {
					cacheDir: '.cache/mcp-vertex',
					docsDir: 'docs/mcp-vertex',
				},
				reader: createWorkspaceFileReader(workspace),
			}),
		);

		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		const profile = JSON.parse(
			await readFile(
				join(root, '.mcp-vertex/project-profile.json'),
				'utf8',
			),
		);
		expect(profile.createdAt).toBe('2026-08-01T00:00:00.000Z');
		expect(profile.projectName).toBe('fixture');
		expect(profile.workspaces[0].path).toBe('.');
		expect(profile.workspaces[1]).toMatchObject({ path: 'apps/web' });
		expect(profile.workspaces[2]).toMatchObject({
			path: 'packages/team/apps/docs',
		});
		expect(profile.workspaces).toHaveLength(3);
	});
	it('bounds deep workspace pattern expansion', async () => {
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'deep-fixture',
				workspaces: ['**/apps/*'],
				scripts: { test: 'vitest run' },
			}),
			'utf8',
		);
		let nestedPath = root;
		for (let index = 0; index < 40; index += 1) {
			nestedPath = join(nestedPath, `level-${index}`);
			mkdirSync(nestedPath, { recursive: true });
		}
		mkdirSync(join(nestedPath, 'apps/deep'), { recursive: true });
		writeFileSync(
			join(nestedPath, 'apps/deep/package.json'),
			JSON.stringify({
				name: '@deep/deep',
				scripts: { test: 'vitest run' },
			}),
			'utf8',
		);

		const workspace = createWorkspacePathProvider(root);
		const adopt = await capture(
			buildAdoptProjectToolRegistration({
				namespacePrefix: 'mcp-vertex',
				workspace,
				corePaths: {
					cacheDir: '.cache/mcp-vertex',
					docsDir: 'docs/mcp-vertex',
				},
				reader: createWorkspaceFileReader(workspace),
			}),
		);

		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		const profile = JSON.parse(
			await readFile(
				join(root, '.mcp-vertex/project-profile.json'),
				'utf8',
			),
		);
		expect(profile.workspaces).toHaveLength(1);
		expect(profile.workspaces[0].path).toBe('.');
		expect(
			profile.workspaces.some((workspace: { path: string }) =>
				workspace.path.includes('apps/deep'),
			),
		).toBe(false);
	});
});
