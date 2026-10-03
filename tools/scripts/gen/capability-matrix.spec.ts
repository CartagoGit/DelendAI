/**
 * capability-matrix.spec.ts — d00009 (Track F / security).
 *
 * Pins the matrix generator's pure layer: the `computeMatrix`
 * function maps plugin declarations + source usage to a 4-state
 * cell for every canonical capability, and `renderMatrix`
 * produces a stable Markdown document.
 *
 * The end-to-end filesystem adapter is exercised once via
 * `buildCapabilityMatrixMarkdown` against a synthetic plugin
 * directory; the file-system path is not asserted byte-for-byte
 * to keep the test resilient to header-line drift.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES } from '@delendai/core/public';

import {
	buildCapabilityMatrixMarkdown,
	computeMatrix,
	preserveStampIfUnchanged,
	renderMatrix,
	type IPluginCapabilityRow,
} from './capability-matrix.script';

let workspace = '';

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'capability-matrix-'));
});

afterEach(async () => {
	if (workspace.length > 0)
		await rm(workspace, { recursive: true, force: true });
});

const writeFileSafe = async (abs: string, body: string): Promise<void> => {
	await mkdir(dirname(abs), { recursive: true });
	await writeFile(abs, body, 'utf8');
};

const samplePlugin = (
	id: string,
	capabilities: readonly string[],
	usage: readonly string[] = [],
): {
	readonly id: string;
	readonly capabilities: readonly string[];
	readonly usage: readonly { readonly capability: string }[];
} => ({
	id,
	capabilities,
	usage: usage.map((capability) => ({ capability })),
});

describe('d00009 — capability matrix generator (Track F)', () => {
	describe('computeMatrix', () => {
		it('marks every cell absent when no plugin declares or uses anything', () => {
			const matrix = computeMatrix({ plugins: [samplePlugin('p', [])] });
			const row = matrix.plugins[0];
			expect(row).toBeDefined();
			if (row === undefined) return;
			for (const cap of CAPABILITIES) {
				expect(row.cells[cap]).toBe('absent');
			}
		});

		it('marks declared+unused with 🟡', () => {
			const matrix = computeMatrix({
				plugins: [samplePlugin('p', ['git:read'])],
			});
			const row = matrix.plugins[0];
			expect(row?.cells['git:read']).toBe('declared-unused');
		});

		it('marks declared+used with ✅', () => {
			const matrix = computeMatrix({
				plugins: [samplePlugin('p', ['git:read'], ['git:read'])],
			});
			expect(matrix.plugins[0]?.cells['git:read']).toBe('declared-used');
		});

		it('marks used+undeclared with 🔴 (lint violation surfaced in the matrix)', () => {
			const matrix = computeMatrix({
				plugins: [samplePlugin('p', [], ['fs:write'])],
			});
			expect(matrix.plugins[0]?.cells['fs:write']).toBe(
				'used-undeclared',
			);
		});

		it('surfaces the top-5 plugins by capability count', () => {
			const matrix = computeMatrix({
				plugins: [
					samplePlugin('a', CAPABILITIES.slice()),
					samplePlugin('b', CAPABILITIES.slice(0, 5)),
					samplePlugin('c', []),
				],
			});
			const top = matrix.summary.topByCapabilityCount;
			expect(top[0]?.pluginId).toBe('a');
			expect(top[0]?.count).toBe(CAPABILITIES.length);
			expect(top[1]?.pluginId).toBe('b');
			expect(top[2]?.pluginId).toBe('c');
		});

		it('flags capabilities declared by ≤ 2 plugins as rare', () => {
			const matrix = computeMatrix({
				plugins: [
					samplePlugin('a', ['git:read', 'fs:read']),
					samplePlugin('b', ['git:read']),
				],
			});
			expect(matrix.summary.rareCapabilities).toContain('fs:read');
			// git:read is declared by 2 plugins → still rare (≤ 2).
			expect(matrix.summary.rareCapabilities).toContain('git:read');
		});
	});

	describe('renderMatrix', () => {
		const _fixtureRows: readonly IPluginCapabilityRow[] = [
			{
				pluginId: 'alpha',
				cells: {
					'fs:read': 'declared-used',
					'fs:write': 'declared-unused',
					'git:push': 'absent',
					'git:read': 'declared-used',
					'git:write': 'used-undeclared',
					'memory:read': 'absent',
					'memory:write': 'absent',
					'network:fetch': 'absent',
					'process:spawn': 'absent',
				},
			},
		];
		const fixtureMatrix = computeMatrix({
			plugins: [
				{
					id: 'alpha',
					capabilities: ['fs:read', 'fs:write', 'git:read'],
					usage: [
						{ capability: 'fs:read' },
						{ capability: 'git:read' },
						{ capability: 'git:write' },
					],
				},
			],
		});

		it('renders the plugin row with the canonical cell symbols', () => {
			const md = renderMatrix(fixtureMatrix);
			const lines = md.split('\n');
			const rowLine = lines.find((l) => l.startsWith('| alpha |'));
			expect(rowLine).toBeDefined();
			if (rowLine === undefined) return;
			// 9 cells; alpha has fs:read=✅, fs:write=🟡, git:write=🔴, others=⚪.
			const cells = rowLine
				.split('|')
				.slice(2, -1)
				.map((cell) => cell.trim());
			expect(cells.length).toBe(CAPABILITIES.length);
			expect(cells[0]).toBe('✅'); // fs:read
			expect(cells[1]).toBe('🟡'); // fs:write
			expect(cells[4]).toBe('🔴'); // git:write
		});

		it('mentions every capability as a column header', () => {
			const md = renderMatrix(fixtureMatrix);
			for (const cap of CAPABILITIES) {
				expect(md).toContain(cap);
			}
		});

		it('includes the summary sections', () => {
			const md = renderMatrix(fixtureMatrix);
			expect(md).toContain('## Summary');
			expect(md).toContain('Top 5 plugins by declared capability count');
		});

		it('output is deterministic: same input ⇒ same output', () => {
			const first = renderMatrix(fixtureMatrix);
			const second = renderMatrix(fixtureMatrix);
			expect(first).toBe(second);
		});
	});

	describe('buildCapabilityMatrixMarkdown (end-to-end on a fixture)', () => {
		const buildFixture = async (): Promise<void> => {
			await writeFileSafe(
				join(workspace, 'plugins', 'alpha', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'alpha',",
					"  capabilities: ['fs:read', 'git:read'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'alpha', 'src', 'index.ts'),
				'ctx.capabilities.fs.read();\n',
			);

			await writeFileSafe(
				join(workspace, 'plugins', 'beta', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'beta',",
					"  capabilities: ['network:fetch'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'beta', 'src', 'index.ts'),
				'// (no usage — declared-unused)\n',
			);
		};

		it('produces a markdown document with both fixtures', async () => {
			await buildFixture();
			const { markdown, violations } =
				await buildCapabilityMatrixMarkdown(workspace);
			expect(markdown).toContain('# Capability Matrix');
			expect(markdown).toContain('| alpha |');
			expect(markdown).toContain('| beta |');
			// alpha uses fs:read; beta declares network:fetch but doesn't use it.
			expect(violations).toEqual([]);
		});
	});
});

describe('preserveStampIfUnchanged', () => {
	const withDate = (date: string, body = 'rows'): string =>
		`# Capability Matrix\n\n> Generated ${date} from plugin manifests + the \`lint:capabilities\` static analysis.\n\n${body}\n`;

	it('keeps the old stamp when only the date moved', () => {
		// A date-only rewrite says the generator ran, not that anything
		// changed. `gen-all --check` gates `git push` with a raw
		// `git diff --exit-code`, so a midnight rollover alone blocked
		// every push until someone committed a one-line date bump.
		expect(
			preserveStampIfUnchanged(
				withDate('2026-09-01'),
				withDate('2026-09-02'),
			),
		).toBe(withDate('2026-09-01'));
	});

	it('takes the new document when the substance changed', () => {
		expect(
			preserveStampIfUnchanged(
				withDate('2026-09-01', 'old rows'),
				withDate('2026-09-02', 'new rows'),
			),
		).toBe(withDate('2026-09-02', 'new rows'));
	});

	it('falls back to the new document when there is no previous stamp', () => {
		expect(preserveStampIfUnchanged('', withDate('2026-09-02'))).toBe(
			withDate('2026-09-02'),
		);
	});
});
