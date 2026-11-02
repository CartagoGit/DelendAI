import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	collectMeasuredBudgetOwnerRows,
	extractToolIdsFromSource,
	findToolNameCollisions,
	lintRoutingCoherence,
	type IRoutingStackPlugin,
} from './routing-coherence.script';

describe('extractToolIdsFromSource', () => {
	it('collects stable unique ids from a tool source file', () => {
		const source = [
			"return { id: 'alpha_tool' };",
			"return { id: 'beta_tool' };",
			"return { id: 'alpha_tool' };",
		].join('\n');
		expect(extractToolIdsFromSource(source)).toEqual([
			'alpha_tool',
			'beta_tool',
		]);
	});
});

describe('collectMeasuredBudgetOwnerRows', () => {
	it('reads explicit measured owner rows from the markdown dashboard', () => {
		const source = [
			'| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools |',
			'| --- | --- | --- | --- | --- | --- |',
			'| dogfood | native | managed | tokens-gate | alpha | 2 |',
			'| dogfood | native | managed | tokens-gate | beta | 1 |',
		].join('\n');
		expect([...collectMeasuredBudgetOwnerRows(source).entries()]).toEqual([
			['alpha', { owner: 'alpha', tools: 2 }],
			['beta', { owner: 'beta', tools: 1 }],
		]);
	});
});

describe('findToolNameCollisions', () => {
	it('reports duplicate advertised MCP names', () => {
		const findings = findToolNameCollisions([
			{ name: 'delendai_alpha_ping', pluginId: 'alpha' },
			{ name: 'delendai_alpha_ping', pluginId: 'beta' },
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe('tool-name-collision');
	});
});

describe('lintRoutingCoherence', () => {
	let root = '';

	const write = (relPath: string, content: string): void => {
		mkdirSync(dirname(join(root, relPath)), { recursive: true });
		writeFileSync(join(root, relPath), content);
	};

	const plugin = (over: {
		pluginId: string;
		packageName: string;
		toolRel: string;
		toolId: string;
		manifestDependencies?: readonly string[];
		packageDependencies?: Readonly<Record<string, string>>;
	}): IRoutingStackPlugin => {
		const deps = over.manifestDependencies ?? ['@delendai/core'];
		write(
			`plugins/${over.pluginId}/plugin.manifest.ts`,
			[
				'export default {',
				`\tid: '${over.pluginId}',`,
				`\tpackage: '${over.packageName}',`,
				`\tdependencies: [${deps.map((dep) => `'${dep}'`).join(', ')}],`,
				'};',
			].join('\n'),
		);
		write(
			`plugins/${over.pluginId}/package.json`,
			`${JSON.stringify(
				{
					name: over.packageName,
					peerDependencies: { '@delendai/core': '^0.1.1' },
					devDependencies: { '@delendai/core': 'workspace:*' },
					dependencies: over.packageDependencies ?? {},
				},
				null,
				'\t',
			)}\n`,
		);
		write(over.toolRel, `export const tool = { id: '${over.toolId}' };\n`);
		return {
			pluginId: over.pluginId,
			packageName: over.packageName,
			manifestRel: `plugins/${over.pluginId}/plugin.manifest.ts`,
			packageRel: `plugins/${over.pluginId}/package.json`,
			toolSourceFiles: [over.toolRel],
		};
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'routing-coherence-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('passes when the stack package links and measured tools are coherent', () => {
		const alpha = plugin({
			pluginId: 'alpha',
			packageName: '@delendai/alpha',
			toolRel: 'plugins/alpha/src/lib/tools/ping.tool.ts',
			toolId: 'ping',
		});
		const beta = plugin({
			pluginId: 'beta',
			packageName: '@delendai/beta',
			toolRel: 'plugins/beta/src/lib/tools/pong.tool.ts',
			toolId: 'pong',
			manifestDependencies: ['@delendai/core', '@delendai/alpha'],
			packageDependencies: { '@delendai/alpha': 'workspace:*' },
		});
		write(
			'docs/delendai/TOKEN-BUDGETS.md',
			[
				'| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools |',
				'| --- | --- | --- | --- | --- | --- |',
				'| dogfood | native | managed | tokens-gate | alpha | 1 |',
				'| dogfood | native | managed | tokens-gate | beta | 1 |',
			].join('\n'),
		);

		expect(lintRoutingCoherence(root, [alpha, beta])).toMatchObject({
			errors: 0,
			ok: true,
		});
	});

	it('fails when a routing plugin has no explicit owner-level token-budget row', () => {
		const alpha = plugin({
			pluginId: 'alpha',
			packageName: '@delendai/alpha',
			toolRel: 'plugins/alpha/src/lib/tools/ping.tool.ts',
			toolId: 'ping',
		});
		write(
			'docs/delendai/TOKEN-BUDGETS.md',
			[
				'| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools |',
				'| --- | --- | --- | --- | --- | --- |',
			].join('\n'),
		);

		const report = lintRoutingCoherence(root, [alpha]);
		expect(report.ok).toBe(false);
		expect(report.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'missing-token-budget-coverage',
					pluginId: 'alpha',
				}),
			]),
		);
	});

	it('fails when the measured owner row covers fewer tools than the plugin advertises', () => {
		const alpha = plugin({
			pluginId: 'alpha',
			packageName: '@delendai/alpha',
			toolRel: 'plugins/alpha/src/lib/tools/ping.tool.ts',
			toolId: 'ping',
		});
		write(
			'plugins/alpha/src/lib/tools/extra.tool.ts',
			"export const extra = { id: 'pong' };\n",
		);
		const expandedAlpha: IRoutingStackPlugin = {
			...alpha,
			toolSourceFiles: [
				...alpha.toolSourceFiles,
				'plugins/alpha/src/lib/tools/extra.tool.ts',
			],
		};
		write(
			'docs/delendai/TOKEN-BUDGETS.md',
			[
				'| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools |',
				'| --- | --- | --- | --- | --- | --- |',
				'| dogfood | native | managed | tokens-gate | alpha | 1 |',
			].join('\n'),
		);

		const report = lintRoutingCoherence(root, [expandedAlpha]);
		expect(report.ok).toBe(false);
		expect(report.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'budgeted-tool-count-mismatch',
					pluginId: 'alpha',
				}),
			]),
		);
	});

	it('fails when a manifest workspace dependency is not mirrored in package.json', () => {
		const alpha = plugin({
			pluginId: 'alpha',
			packageName: '@delendai/alpha',
			toolRel: 'plugins/alpha/src/lib/tools/ping.tool.ts',
			toolId: 'ping',
		});
		const beta = plugin({
			pluginId: 'beta',
			packageName: '@delendai/beta',
			toolRel: 'plugins/beta/src/lib/tools/pong.tool.ts',
			toolId: 'pong',
			manifestDependencies: ['@delendai/core', '@delendai/alpha'],
		});
		write(
			'docs/delendai/TOKEN-BUDGETS.md',
			[
				'| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools |',
				'| --- | --- | --- | --- | --- | --- |',
				'| dogfood | native | managed | tokens-gate | alpha | 1 |',
				'| dogfood | native | managed | tokens-gate | beta | 1 |',
			].join('\n'),
		);

		const report = lintRoutingCoherence(root, [alpha, beta]);
		expect(report.ok).toBe(false);
		expect(report.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'missing-workspace-dependency',
					pluginId: 'beta',
				}),
			]),
		);
	});
});
