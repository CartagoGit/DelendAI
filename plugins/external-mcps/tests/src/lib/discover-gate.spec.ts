/**
 * discover-gate.spec.ts — the ⛔ live tier gate (f00068 S5, decisions 3 + 5).
 *
 * Pins the three guards on `external_mcp_discover`:
 *
 * 1. OFF by default → `{ ok:false, code:'discovery-disabled' }` and PROVABLY
 *    zero network calls (the injected search spy is never touched).
 * 2. ON → up to 10 compact rows + a `total`; a spent 10/10-min budget
 *    (injectable clock) returns `{ ok:false, code:'budget-exceeded' }`
 *    without another network call.
 * 3. The rolling window frees the budget once the injected clock advances.
 */
import { describe, expect, it, vi } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildDiscoverToolRegistration,
	createCallBudget,
	DISCOVER_BUDGET_LIMIT,
	DISCOVER_BUDGET_WINDOW_MS,
	DISCOVER_MAX_RESULTS,
	DiscoverOutputSchema,
	type INpmSearchClient,
	type INpmSearchResult,
} from '../../../src/lib/tools/discover.tool';

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly config: {
		description: string;
		inputSchema: unknown;
		outputSchema: unknown;
	};
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

const captureTool = async (reg: IToolRegistration): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			config: ICapturedTool['config'],
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, config, handler });
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('discover tool did not register');
	return tool;
};

const fakeResults = (count: number): readonly INpmSearchResult[] =>
	Array.from({ length: count }, (_, i) => ({
		name: `mcp-candidate-${i}`,
		version: `1.0.${i}`,
		description: `candidate ${i}`,
	}));

describe('external_mcp_discover — gate (off by default)', () => {
	it('registers under the namespace with the network effect', async () => {
		const reg = buildDiscoverToolRegistration({
			namespacePrefix: 'external-mcps',
			allowDiscoverySearch: false,
		});
		const tool = await captureTool(reg);
		expect(tool.name).toBe('external-mcps_discover');
		expect(reg.effects).toEqual(['network']);
		expect(tool.config.outputSchema).toBeDefined();
	});

	it('returns the opt-in hint and makes ZERO network calls when off', async () => {
		const search = vi.fn<INpmSearchClient>(async () => fakeResults(3));
		const tool = await captureTool(
			buildDiscoverToolRegistration({
				namespacePrefix: 'external-mcps',
				allowDiscoverySearch: false,
				search,
			}),
		);
		const result = await tool.handler({ query: 'zig language server' });
		const payload = DiscoverOutputSchema.parse(result.structuredContent);
		expect(payload).toMatchObject({
			ok: false,
			code: 'discovery-disabled',
		});
		expect(payload.hint).toContain('allowDiscoverySearch');
		// The load-bearing assertion: the injected search was never consulted.
		expect(search).not.toHaveBeenCalled();
	});
});

describe('external_mcp_discover — enabled', () => {
	const build = (over: {
		readonly search?: INpmSearchClient;
		readonly now?: () => number;
	}): IToolRegistration =>
		buildDiscoverToolRegistration({
			namespacePrefix: 'external-mcps',
			allowDiscoverySearch: true,
			...over,
		});

	it('rejects an empty query without touching the network', async () => {
		const search = vi.fn<INpmSearchClient>(async () => fakeResults(1));
		const tool = await captureTool(build({ search }));
		const result = await tool.handler({ query: '   ' });
		expect(result.isError).toBe(true);
		expect(search).not.toHaveBeenCalled();
	});

	it('returns up to 10 compact rows plus the true total', async () => {
		const search = vi.fn<INpmSearchClient>(async () => fakeResults(25));
		const tool = await captureTool(build({ search }));
		const result = await tool.handler({ query: 'postgres' });
		const payload = DiscoverOutputSchema.parse(result.structuredContent);
		expect(payload.ok).toBe(true);
		expect(payload.total).toBe(25);
		expect(payload.results).toHaveLength(DISCOVER_MAX_RESULTS);
		expect(search).toHaveBeenCalledWith('postgres', DISCOVER_MAX_RESULTS);
		expect(payload.budget?.remaining).toBe(DISCOVER_BUDGET_LIMIT - 1);
	});

	it('enforces the 10/10-min budget in-memory (no further network call)', async () => {
		const search = vi.fn<INpmSearchClient>(async () => fakeResults(2));
		let clock = 0;
		const tool = await captureTool(build({ search, now: () => clock }));
		// Spend the whole budget within the window.
		for (let i = 0; i < DISCOVER_BUDGET_LIMIT; i++) {
			clock += 1000; // 1s apart — all inside the 10-min window
			const ok = await tool.handler({ query: `q${i}` });
			expect(DiscoverOutputSchema.parse(ok.structuredContent).ok).toBe(
				true,
			);
		}
		expect(search).toHaveBeenCalledTimes(DISCOVER_BUDGET_LIMIT);
		// The 11th call is refused BEFORE any network call.
		const blocked = await tool.handler({ query: 'one-too-many' });
		const payload = DiscoverOutputSchema.parse(blocked.structuredContent);
		expect(payload).toMatchObject({ ok: false, code: 'budget-exceeded' });
		expect(payload.budget?.remaining).toBe(0);
		expect(search).toHaveBeenCalledTimes(DISCOVER_BUDGET_LIMIT);
	});

	it('frees the budget once the window rolls over', async () => {
		const search = vi.fn<INpmSearchClient>(async () => fakeResults(1));
		let clock = 0;
		const tool = await captureTool(build({ search, now: () => clock }));
		for (let i = 0; i < DISCOVER_BUDGET_LIMIT; i++) {
			await tool.handler({ query: `q${i}` });
		}
		// Advance past the window: the oldest hits expire.
		clock += DISCOVER_BUDGET_WINDOW_MS + 1;
		const after = await tool.handler({ query: 'fresh-window' });
		expect(DiscoverOutputSchema.parse(after.structuredContent).ok).toBe(
			true,
		);
		expect(search).toHaveBeenCalledTimes(DISCOVER_BUDGET_LIMIT + 1);
	});
});

describe('createCallBudget (pure rolling window)', () => {
	it('caps at the limit then reopens after the window', () => {
		let clock = 0;
		const budget = createCallBudget(2, 1000, () => clock);
		expect(budget.tryConsume()).toBe(true);
		expect(budget.tryConsume()).toBe(true);
		expect(budget.remaining()).toBe(0);
		expect(budget.tryConsume()).toBe(false);
		clock += 1001;
		expect(budget.tryConsume()).toBe(true);
		expect(budget.remaining()).toBe(1);
	});
});
