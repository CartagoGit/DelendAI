import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkPluginGraph as checkCommandPluginGraph } from '../../commands/doctor-checks/plugin-graph';
import type { IDoctorCommandCheckContext } from '../../commands/doctor';
import { isDelendaiSourceWorkspace } from './applicability';
import { checkDeps } from './checks/deps.check';
import { checkNetworkDependentSurfaces } from './checks/network.check';
import { checkManifests } from './checks/manifests.check';
import { checkPluginGraph } from './checks/plugin-graph.check';
import { checkRuntime } from './checks/runtime.check';
import { checkSchemas } from './checks/schemas.check';
import { checkTokenBudgets } from './checks/token-budgets.check';
import type { IDoctorCheckContext, IDoctorFs } from './types';

const buildFs = (files: Record<string, string>): IDoctorFs => ({
	fileExists: async (rel) => Object.hasOwn(files, rel),
	readFile: async (rel) => files[rel],
	listDirs: async (rel) => {
		const prefix = rel.length === 0 ? '' : `${rel}/`;
		const entries = new Set<string>();
		for (const path of Object.keys(files)) {
			if (!path.startsWith(prefix)) continue;
			const next = path.slice(prefix.length).split('/')[0];
			if (next !== undefined && next.length > 0) entries.add(next);
		}
		return [...entries];
	},
});

const ctx = (files: Record<string, string>): IDoctorCheckContext => ({
	workspace: '/w',
	fs: buildFs(files),
	now: () => new Date('2026-10-01T00:00:00Z'),
});

const CONSUMER = {
	'package.json': JSON.stringify({
		name: 'shop',
		dependencies: { left: '1.0.0' },
	}),
	'delendai.config.json': '{}',
};

const DELENDAI = {
	'package.json': JSON.stringify({
		name: '@delendai/core-monorepo',
		engines: { bun: '>=0.0.1' },
	}),
	'bun.lock': 'lock',
	'config/token-budgets.json': '{}',
	'plugins/a/plugin.manifest.ts': 'definePluginManifest({})',
	'plugins/a/package.json': '{}',
	'plugins/a/src/x.schema.ts': 'export {};',
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the delendai source checkout signal', () => {
	it('is the monorepo package name, and nothing a consumer has', async () => {
		expect(await isDelendaiSourceWorkspace(buildFs(DELENDAI))).toBe(true);
		expect(await isDelendaiSourceWorkspace(buildFs(CONSUMER))).toBe(false);
		expect(await isDelendaiSourceWorkspace(buildFs({}))).toBe(false);
		expect(
			await isDelendaiSourceWorkspace(buildFs({ 'package.json': '{' })),
		).toBe(false);
	});
});

describe.each([
	['manifests', checkManifests],
	['plugin-graph', checkPluginGraph],
	['schemas', checkSchemas],
	['token-budgets', checkTokenBudgets],
])('%s', (name, check) => {
	it('is not applicable in a consumer project, and says so', async () => {
		for (const files of [CONSUMER, {}]) {
			const section = await check(ctx(files));
			expect(section.name).toBe(name);
			expect(section.status).toBe('not-applicable');
			expect(section.findings[0]).toContain('delendai source checkout');
		}
	});

	it('still runs in the delendai source checkout', async () => {
		expect((await check(ctx(DELENDAI))).status).toBe('ok');
	});

	it('still reports a real problem in the delendai source checkout', async () => {
		const broken = {
			'package.json': DELENDAI['package.json'],
			'config/token-budgets.json': '{',
			'plugins/a/package.json': JSON.stringify({
				dependencies: { '@delendai/ghost': '1' },
			}),
		};
		expect((await check(ctx(broken))).status).toBe('warn');
	});
});

describe('plugin-graph (command layer)', () => {
	it('is not applicable in a consumer project', async () => {
		const section = await checkCommandPluginGraph({
			...ctx(CONSUMER),
			cli: {} as IDoctorCommandCheckContext['cli'],
		});
		expect(section.status).toBe('not-applicable');
	});
});

describe('deps follows the project package manager', () => {
	it.each([
		['bun.lock', 'bun'],
		['bun.lockb', 'bun'],
		['package-lock.json', 'npm'],
		['pnpm-lock.yaml', 'pnpm'],
		['yarn.lock', 'yarn'],
	])('accepts %s', async (lockfile, manager) => {
		const section = await checkDeps(ctx({ ...CONSUMER, [lockfile]: '' }));
		expect(section.status).toBe('ok');
		expect(section.findings[0]).toContain(manager);
	});

	it('warns when a project with dependencies has no lockfile', async () => {
		const section = await checkDeps(ctx(CONSUMER));
		expect(section.status).toBe('warn');
		expect(section.findings[0]).toContain('no lockfile');
	});

	it('needs no lockfile when nothing is declared', async () => {
		const section = await checkDeps(
			ctx({ 'package.json': '{"name":"docs"}' }),
		);
		expect(section.status).toBe('ok');
	});

	it('is not applicable without a package.json', async () => {
		expect((await checkDeps(ctx({}))).status).toBe('not-applicable');
	});

	it('warns on an unparseable package.json', async () => {
		expect((await checkDeps(ctx({ 'package.json': '{' }))).status).toBe(
			'warn',
		);
	});
});

describe('runtime follows the project engines field', () => {
	it('is not applicable when the project declares no floor', async () => {
		const section = await checkRuntime(ctx(CONSUMER));
		expect(section.status).toBe('not-applicable');
	});

	it('is not applicable without a package.json', async () => {
		expect((await checkRuntime(ctx({}))).status).toBe('not-applicable');
	});

	it('checks a node floor the consumer chose', async () => {
		const ok = await checkRuntime(
			ctx({ 'package.json': '{"engines":{"node":">=1.0.0"}}' }),
		);
		expect(ok.status).toBe('ok');
		const below = await checkRuntime(
			ctx({ 'package.json': '{"engines":{"node":">=999.0.0"}}' }),
		);
		expect(below.status).toBe('error');
		expect(below.findings[0]).toContain('below floor');
	});

	it('still enforces an engines.bun floor', async () => {
		vi.stubGlobal('Bun', { version: '1.0.0' });
		const section = await checkRuntime(
			ctx({ 'package.json': '{"engines":{"bun":">=1.1.0"}}' }),
		);
		expect(section.status).toBe('error');
	});

	it('warns on an unparseable package.json instead of throwing', async () => {
		expect((await checkRuntime(ctx({ 'package.json': '{' }))).status).toBe(
			'warn',
		);
	});
});

describe('network-surfaces', () => {
	it('reports its standing skip as not applicable, never as a warning', async () => {
		const section = await checkNetworkDependentSurfaces(ctx(CONSUMER));
		expect(section.status).toBe('not-applicable');
	});
});
