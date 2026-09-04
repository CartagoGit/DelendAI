import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeProject } from '@delendai/core/lib/bootstrap/analyze-project';
import {
	buildBlueprintFiles,
	buildServerBlueprint,
} from '@delendai/core/lib/bootstrap/build-blueprint';
import { createWorkspaceFileReader } from '@delendai/core/lib/bootstrap/workspace-file-reader';
import { createWorkspacePathProvider } from '@delendai/core/public';

const roots: string[] = [];

const fixture = (files: Readonly<Record<string, string>>) => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-adoption-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const absolute = join(root, path);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
	return createWorkspaceFileReader(createWorkspacePathProvider(root));
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('consumer adoption modes e2e', () => {
	it('keeps replace, augment and partial plans observably distinct', async () => {
		const analysis = await analyzeProject(
			fixture({
				'package.json': JSON.stringify({
					name: '@consumer/api',
					scripts: { lint: 'eslint .', test: 'vitest' },
				}),
				'.vscode/mcp.json': '{ "servers": { "legacy": {} } }',
				'.github/agents/existing.agent.md': '# Existing agent',
				'.github/copilot-instructions.md': '# Existing instructions',
				'src/existing.ts': 'export const existing = true;',
			}),
		);

		const replace = buildServerBlueprint(analysis, {
			adoption: { mode: 'replace' },
		});
		const augment = buildServerBlueprint(analysis, {
			adoption: { mode: 'augment' },
		});
		const partial = buildServerBlueprint(analysis, {
			adoption: {
				mode: 'partial',
				selectedCapabilities: ['tools'],
			},
		});

		expect(
			replace.adoptionStrategy.requiresExplicitReplacementConsent,
		).toBe(true);
		expect(buildBlueprintFiles(replace).map(({ path }) => path)).toContain(
			'.vscode/mcp.json',
		);

		for (const blueprint of [augment, partial]) {
			const paths = buildBlueprintFiles(blueprint).map(
				({ path }) => path,
			);
			expect(paths).not.toContain('.vscode/mcp.json');
			expect(paths).not.toContain('.github/agents/existing.agent.md');
			expect(paths).not.toContain('.github/copilot-instructions.md');
			expect(paths).not.toContain('src/existing.ts');
		}

		expect(partial.prompts).toEqual([]);
		expect(partial.skills).toEqual([]);
		expect(partial.agents).toEqual([]);
		expect(
			buildBlueprintFiles(partial).every(({ path }) =>
				path.includes('/tools/'),
			),
		).toBe(true);
		expect(
			augment.prompts.length +
				augment.skills.length +
				augment.agents.length,
		).toBeGreaterThan(0);
	});

	it('dogfoods the real repository identity without targeting libs/mcp-project', async () => {
		const analysis = await analyzeProject(
			fixture({
				'package.json': JSON.stringify({
					name: '@delendai/core-monorepo',
					workspaces: ['packages/*', 'plugins/*'],
				}),
				'.vscode/mcp.json': '{ "servers": { "delendai": {} } }',
			}),
		);
		const blueprint = buildServerBlueprint(analysis);
		const files = buildBlueprintFiles(blueprint);
		expect(blueprint.namespacePrefix).toBe('delendai');
		expect(blueprint.targetDir).toBe('packages/core');
		expect(
			files.every(({ path }) => !path.startsWith('libs/mcp-project')),
		).toBe(true);
		expect(
			files
				.filter(({ path }) => path.endsWith('.ts'))
				.every(({ content }) => !content.includes('DELENDAI')),
		).toBe(true);
	});
});
