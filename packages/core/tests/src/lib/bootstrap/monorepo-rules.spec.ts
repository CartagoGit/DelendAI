// monorepo-rules.spec.ts: pin the SOLID monorepo detection table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_MONOREPO_RULES,
	matchMonorepoTool,
} from '@mcp-vertex/core/lib/bootstrap/monorepo-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_MONOREPO_RULES (declarative table)', () => {
	it('lists the five built-in monorepo tools', () => {
		const ids = DEFAULT_MONOREPO_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'nx',
			'turbo',
			'pnpm-workspaces',
			'lerna',
			'bun/npm-workspaces',
		]);
	});
	it('nx outranks turbo (priority preserves detection order)', () => {
		const nx = DEFAULT_MONOREPO_RULES.find((r) => r.id === 'nx');
		const turbo = DEFAULT_MONOREPO_RULES.find((r) => r.id === 'turbo');
		expect(nx?.priority).toBeGreaterThan(turbo?.priority ?? 0);
	});
});

describe('matchMonorepoTool', () => {
	it('returns `nx` for a project with nx.json', () => {
		expect(matchMonorepoTool(reader({ 'nx.json': '{}' }))).toBe('nx');
	});
	it('returns `turbo` for a project with turbo.json', () => {
		expect(matchMonorepoTool(reader({ 'turbo.json': '{}' }))).toBe('turbo');
	});
	it('returns `pnpm-workspaces` for a project with pnpm-workspace.yaml', () => {
		expect(
			matchMonorepoTool(reader({ 'pnpm-workspace.yaml': 'packages:' })),
		).toBe('pnpm-workspaces');
	});
	it('returns `lerna` for a project with lerna.json', () => {
		expect(matchMonorepoTool(reader({ 'lerna.json': '{}' }))).toBe('lerna');
	});
	it('returns `bun/npm-workspaces` for a package.json with `workspaces`', () => {
		expect(
			matchMonorepoTool(reader({}), {
				name: 'svc',
				workspaces: ['packages/*'],
			}),
		).toBe('bun/npm-workspaces');
	});
	it('returns `undefined` for a project with no monorepo signals', () => {
		expect(matchMonorepoTool(reader({}))).toBeUndefined();
	});
	it('priority order: nx beats turbo when both are present', () => {
		expect(
			matchMonorepoTool(reader({ 'nx.json': '{}', 'turbo.json': '{}' })),
		).toBe('nx');
	});
});

describe('integration: detectMonorepoTool uses the rule table', () => {
	it('analyzer detects a bun workspaces project from `workspaces` in package.json', () => {
		const analysis = analyzeProject(
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
