/**
 * core-public-inventory.spec.ts — covers r00027 (Track C / §50).
 *
 * Tests the inventory classifier: every export of the public
 * barrel gets one of `stable | experimental | internal |
 * deprecated`, the deprecated `nodeDynamicImport` lands in the
 * deprecated bucket (b00237), and the internal `withFileMutex`
 * lands in the internal bucket.
 */

import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runInventory = async (
	args: readonly string[],
): Promise<{ stdout: string; stderr: string; exit: number }> => {
	return new Promise((resolve) => {
		const proc = spawn(
			'bun',
			['tools/scripts/inspect/core-public-inventory.script.ts', ...args],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		);
		let stdout = '';
		let stderr = '';
		proc.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.once('error', () => resolve({ stdout, stderr, exit: 1 }));
		proc.once('close', (code) =>
			resolve({ stdout, stderr, exit: code ?? 1 }),
		);
	});
};

interface IInventoryExport {
	readonly name: string;
	readonly maturity: 'stable' | 'experimental' | 'internal' | 'deprecated';
}

interface IInventoryJson {
	readonly totals: {
		readonly stable: number;
		readonly experimental: number;
		readonly internal: number;
		readonly deprecated: number;
	};
	readonly count: number;
	readonly exports: readonly IInventoryExport[];
}

describe('core-public-inventory (r00027)', () => {
	it('runs and exits 0', async () => {
		const { exit, stderr } = await runInventory(['--json']);
		expect(exit).toBe(0);
		expect(stderr).toBe('');
	});

	it('classifies nodeDynamicImport as deprecated (b00237)', async () => {
		const { stdout } = await runInventory(['--json']);
		const inv = JSON.parse(stdout) as IInventoryJson;
		const entry = inv.exports.find((e) => e.name === 'nodeDynamicImport');
		expect(entry).toBeDefined();
		expect(entry?.maturity).toBe('deprecated');
	});

	it('classifies withFileMutex as internal', async () => {
		const { stdout } = await runInventory(['--json']);
		const inv = JSON.parse(stdout) as IInventoryJson;
		const entry = inv.exports.find((e) => e.name === 'withFileMutex');
		expect(entry).toBeDefined();
		expect(entry?.maturity).toBe('internal');
	});

	it('totals add up to count', async () => {
		const { stdout } = await runInventory(['--json']);
		const inv = JSON.parse(stdout) as IInventoryJson;
		const sum =
			inv.totals.stable +
			inv.totals.experimental +
			inv.totals.internal +
			inv.totals.deprecated;
		expect(sum).toBe(inv.count);
		expect(inv.count).toBeGreaterThan(0);
	});

	it('renders a Markdown table on --md', async () => {
		const { stdout, exit } = await runInventory(['--md']);
		expect(exit).toBe(0);
		expect(stdout).toContain('# `@mcp-vertex/core` public API inventory');
		expect(stdout).toContain('| Maturity | Count |');
	});
});
