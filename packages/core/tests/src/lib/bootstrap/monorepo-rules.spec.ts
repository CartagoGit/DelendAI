// monorepo-rules.spec.ts: pin the SOLID monorepo detection table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_MONOREPO_RULES,
	matchMonorepoTool,
} from '@mcp-vertex/core/lib/bootstrap/monorepo-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('DEFAULT_MONOREPO_RULES (declarative table)', async () => {
	it('lists the five built-in monorepo tools', async () => {
		const ids = DEFAULT_MONOREPO_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'nx',
			'turbo',
			'pnpm-workspaces',
			'lerna',
			'bun/npm-workspaces',
		]);
	});
	it('nx outranks turbo (priority preserves detection order)', async () => {
		const nx = DEFAULT_MONOREPO_RULES.find((r) => r.id === 'nx');
		const turbo = DEFAULT_MONOREPO_RULES.find((r) => r.id === 'turbo');
		expect(nx?.priority).toBeGreaterThan(turbo?.priority ?? 0);
	});
});

describe('matchMonorepoTool', async () => {
	it('returns `nx` for a project with nx.json', async () => {
		expect(await matchMonorepoTool(reader({ 'nx.json': '{}' }))).toBe('nx');
	});
	it('returns `turbo` for a project with turbo.json', async () => {
		expect(await matchMonorepoTool(reader({ 'turbo.json': '{}' }))).toBe(
			'turbo',
		);
	});
	it('returns `pnpm-workspaces` for a project with pnpm-workspace.yaml', async () => {
		expect(
			await matchMonorepoTool(
				reader({ 'pnpm-workspace.yaml': 'packages:' }),
			),
		).toBe('pnpm-workspaces');
	});
	it('returns `lerna` for a project with lerna.json', async () => {
		expect(await matchMonorepoTool(reader({ 'lerna.json': '{}' }))).toBe(
			'lerna',
		);
	});
	it('returns `bun/npm-workspaces` for a package.json with `workspaces`', async () => {
		expect(
			await matchMonorepoTool(reader({}), {
				name: 'svc',
				workspaces: ['packages/*'],
			}),
		).toBe('bun/npm-workspaces');
	});
	it('returns `undefined` for a project with no monorepo signals', async () => {
		expect(await matchMonorepoTool(reader({}))).toBeUndefined();
	});
	it('priority order: nx beats turbo when both are present', async () => {
		expect(
			await matchMonorepoTool(
				reader({ 'nx.json': '{}', 'turbo.json': '{}' }),
			),
		).toBe('nx');
	});
});

describe('integration: detectMonorepoTool uses the rule table', async () => {
	it('analyzer detects a bun workspaces project from `workspaces` in package.json', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'big',
					workspaces: ['packages/*'],
				}),
			}),
		);
		expect(analysis.monorepoTool).toBe('bun/npm-workspaces');
	});
});
