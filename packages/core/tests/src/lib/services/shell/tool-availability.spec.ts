import { describe, expect, it } from 'vitest';

import {
	createToolAvailabilityService,
	SHELL_TOOL_REGISTRY,
	withExtendedRegistry,
	type IShellProbeResult,
	type IShellRunner,
	type IToolAvailabilityService,
} from '../../../../../src/lib/services/shell/tool-availability';

/**
 * Build a runner whose `resolveBatch` returns a presence row per tool.
 * `presence` is a map: tool basename → path (or `null` for missing,
 * `'__error__'` for a probe that should fail).
 */
const makeFakeRunner = (
	presence: Readonly<Record<string, string | null>>,
	versionFor: (path: string, flag: string) => string | null = () => null,
): IShellRunner => ({
	resolveBatch: async (tools) => {
		const results: IShellProbeResult[] = tools.map((tool) => {
			const value = presence[tool.checkCommand];
			if (value === undefined) {
				return {
					name: tool.name,
					path: null,
					version: null,
					status: 'missing',
				};
			}
			if (value === null) {
				return {
					name: tool.name,
					path: null,
					version: null,
					status: 'missing',
				};
			}
			if (value === '__error__') {
				return {
					name: tool.name,
					path: null,
					version: null,
					status: 'error',
					errorReason: 'forced error for test',
				};
			}
			return {
				name: tool.name,
				path: value,
				version: null,
				status: 'present',
			};
		});
		return results;
	},
	versionFor: async (path, flag) => versionFor(path, flag),
});

const noopSignal = new AbortController().signal;

const buildService = (
	presence: Readonly<Record<string, string | null>>,
	versionFor?: (path: string, flag: string) => string | null,
	ttlMs = 30_000,
): IToolAvailabilityService =>
	createToolAvailabilityService({
		runner: makeFakeRunner(presence, versionFor),
		ttlMs,
	});

describe('createToolAvailabilityService (f00418 S2)', () => {
	it('returns the default registry when none is supplied', async () => {
		const service = buildService({});
		const result = await service.list({}, noopSignal);
		expect(result.tools).toHaveLength(SHELL_TOOL_REGISTRY.length);
		expect(result.tools.map((t) => t.name)).toEqual(
			SHELL_TOOL_REGISTRY.map((t) => t.name),
		);
	});

	it('marks every tool as missing when the runner reports no presence', async () => {
		const service = buildService({});
		const result = await service.list({}, noopSignal);
		for (const row of result.tools) {
			expect(row.availability).toBe('missing');
			expect(row.path).toBeNull();
			expect(row.version).toBeNull();
		}
	});

	it('reports present + version + alternative when the runner resolves all', async () => {
		const service = buildService(
			{ rg: '/usr/local/bin/rg', grep: '/bin/grep', bun: '/opt/bun' },
			(path, flag) => `${path} ${flag}`,
		);
		const result = await service.list({}, noopSignal);
		const rg = result.tools.find((row) => row.name === 'rg');
		expect(rg).toBeDefined();
		expect(rg?.availability).toBe('present');
		expect(rg?.path).toBe('/usr/local/bin/rg');
		expect(rg?.version).toBe('/usr/local/bin/rg --version');
		expect(rg?.alternativesAvailable).toContain('grep');
		const bun = result.tools.find((row) => row.name === 'bun');
		expect(bun?.alternativesAvailable).toContain('node');
	});

	it('marks presence status as "unknown" when the probe errored', async () => {
		const service = buildService({ rg: '__error__' });
		const result = await service.list({}, noopSignal);
		const rg = result.tools.find((row) => row.name === 'rg');
		expect(rg?.availability).toBe('unknown');
		expect(rg?.probeStatus).toBe('error');
	});

	it('caches the snapshot until the TTL expires', async () => {
		let now = 1_000;
		const service = createToolAvailabilityService({
			runner: makeFakeRunner({ git: '/usr/bin/git' }),
			ttlMs: 1_000,
			clock: () => now,
		});
		const first = await service.list({}, noopSignal);
		expect(first.generatedAt).toBe(1_000);
		now = 1_500;
		const second = await service.list({}, noopSignal);
		expect(second.generatedAt).toBe(1_000);
		now = 2_500;
		const third = await service.list({}, noopSignal);
		expect(third.generatedAt).toBe(2_500);
	});

	it('does not cache when the caller narrows the inventory by name', async () => {
		const service = buildService(
			{ git: '/usr/bin/git' },
			() => 'v1',
			30_000,
		);
		const full = await service.list({}, noopSignal);
		expect(full.tools.length).toBe(SHELL_TOOL_REGISTRY.length);
		const narrow = await service.list({ names: ['git'] }, noopSignal);
		expect(narrow.tools.map((t) => t.name)).toEqual(['git']);
		const fullAgain = await service.list({}, noopSignal);
		expect(fullAgain.tools.length).toBe(SHELL_TOOL_REGISTRY.length);
	});

	it('reportFor returns the matching row or null', async () => {
		const service = buildService({ bun: '/opt/bun' });
		const row = await service.reportFor('bun', noopSignal);
		expect(row?.availability).toBe('present');
		const missing = await service.reportFor('ghost', noopSignal);
		expect(missing).toBeNull();
	});

	it('invalidate forces the next list() to re-probe', async () => {
		let probes = 0;
		const runner: IShellRunner = {
			resolveBatch: async (tools) => {
				probes += 1;
				return tools.map((tool) => ({
					name: tool.name,
					path: null,
					version: null,
					status: 'missing',
				}));
			},
			versionFor: async () => null,
		};
		const service = createToolAvailabilityService({ runner });
		await service.list({}, noopSignal);
		await service.list({}, noopSignal);
		expect(probes).toBe(1);
		service.invalidate();
		await service.list({}, noopSignal);
		expect(probes).toBe(2);
	});

	it('attachSuggestions leaves present tools without a suggestion', async () => {
		const service = createToolAvailabilityService({
			runner: makeFakeRunner({ rg: '/usr/bin/rg' }),
			suggestInstall: async () => null,
		});
		const base = await service.list({}, noopSignal);
		const enriched = await service.attachSuggestions(
			base.tools,
			noopSignal,
		);
		const rg = enriched.find((row) => row.name === 'rg');
		expect(rg?.suggestInstall).toBeNull();
	});

	it('attachSuggestions asks the suggestion resolver only for missing tools', async () => {
		const calls: string[] = [];
		const service = createToolAvailabilityService({
			runner: makeFakeRunner({ git: '/usr/bin/git' }),
			suggestInstall: async (entry) => {
				calls.push(entry.name);
				return null;
			},
		});
		const base = await service.list({}, noopSignal);
		await service.attachSuggestions(base.tools, noopSignal);
		expect(calls).not.toContain('git');
		expect(calls.length).toBeGreaterThan(0);
		expect(calls).toContain('rg');
	});

	it('withExtendedRegistry concatenates default + host entries', () => {
		const extended = withExtendedRegistry([
			{
				name: 'glow',
				purpose: 'markdown renderer',
				checkCommand: 'glow',
				versionFlag: '--version',
				alternatives: [],
			},
		]);
		expect(extended.map((t) => t.name)).toContain('git');
		expect(extended.map((t) => t.name)).toContain('glow');
	});
});
