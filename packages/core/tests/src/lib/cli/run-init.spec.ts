/**
 * run-init.spec.ts — `init`'s editor installation: arguments, the report,
 * and a run that configures one editor in the project only.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IInstallReport } from '@delendai/core/lib/install/installer';
import {
	formatInstallReport,
	parseInitArgs,
	runInit,
} from '@delendai/core/lib/cli/run-init';

describe('run-init', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it('reads the editors, the runner and the preset, and ignores a runner it does not know', () => {
		expect(
			parseInitArgs([
				'--all',
				'--ide=vscode, cursor,',
				'--via=bunx',
				'--preset=swarm',
			]),
		).toEqual({
			all: true,
			ide: ['vscode', 'cursor'],
			via: 'bunx',
			preset: 'swarm',
		});
		expect(parseInitArgs(['--via=make'])).toEqual({});
	});

	it('says what it configured, or how to choose when it found nothing', () => {
		const os = { id: 'wsl' as const, label: 'Linux', note: 'WSL detected' };
		const none = formatInstallReport(
			fakePartial<IInstallReport>({
				os,
				results: [],
				detected: true,
				ok: true,
			}),
		);
		expect(none).toContain('No IDE/agent config detected here');
		expect(none).toContain('WSL detected');
		const some = formatInstallReport(
			fakePartial<IInstallReport>({
				os,
				results: [
					{
						id: 'vscode',
						label: 'VS Code',
						path: '/p/.vscode/mcp.json',
						action: 'created',
					},
					{
						id: 'zed',
						label: 'Zed',
						path: '/z',
						action: 'skipped',
						reason: 'left as it is',
					},
				],
				detected: false,
				ok: true,
			}),
		);
		expect(some).toContain('Configured:');
		expect(some).toContain('✓ VS Code [created]');
		expect(some).toContain('– Zed [skipped] (left as it is)');
	});

	it('configures the one editor asked for, in the project', async () => {
		const project = mkdtempSync(join(tmpdir(), 'run-init-'));
		dirs.push(project);
		const written: string[] = [];
		const spy = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				written.push(String(chunk));
				return true;
			});
		try {
			await runInit(['--ide=vscode'], project);
		} finally {
			spy.mockRestore();
		}
		expect(existsSync(join(project, '.vscode', 'mcp.json'))).toBe(true);
		expect(written.join('')).toContain('VS Code');
	});
});
