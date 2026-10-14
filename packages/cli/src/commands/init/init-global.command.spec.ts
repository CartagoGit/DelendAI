import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

import type { IInstallReport } from '@delendai/core/cli';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { parseGlobalArgs, runGlobalInit } from './init-global.command';

const install = vi.hoisted(() => ({ report: undefined as unknown }));

vi.mock('@delendai/core/public', () => ({
	runInstall: vi.fn(async () => install.report),
}));

const contextWith = (
	globals: Partial<ICliCommandContext['globals']>,
): ICliCommandContext =>
	fakePartial<ICliCommandContext>({
		cwd: '/project',
		globals: fakePartial<ICliCommandContext['globals']>(globals),
	});

const reportWith = (overrides: Partial<IInstallReport>): IInstallReport =>
	fakePartial<IInstallReport>({
		ok: true,
		os: fakePartial<IInstallReport['os']>({ label: 'Linux' }),
		results: [],
		...overrides,
	});

describe('init:global argument parsing', () => {
	it('installs every global target when no target is specified', () => {
		expect(parseGlobalArgs([])).toEqual({
			options: { all: true, globalOnly: true },
		});
	});

	it('keeps an explicit global target list and global-only scope', () => {
		expect(parseGlobalArgs(['--ide=cursor-global,zed'])).toEqual({
			options: {
				ide: ['cursor-global', 'zed'],
				all: false,
				globalOnly: true,
			},
		});
	});

	it('rejects an empty target list instead of falling back to autodetection', () => {
		expect(parseGlobalArgs(['--ide='])).toEqual({
			error: 'usage: --ide must contain at least one target id',
		});
	});

	it('rejects unknown and project-scoped targets', () => {
		expect(parseGlobalArgs(['--ide=not-a-host']).error).toContain(
			'unknown global host target',
		);
		expect(parseGlobalArgs(['--ide=cursor']).error).toContain(
			'project-scoped',
		);
	});
});

describe('init:global runner options', () => {
	it('keeps a known runner and a preset, and ignores an unknown runner', () => {
		expect(
			parseGlobalArgs(['--via=bunx', '--preset=minimal', '--all'])
				.options,
		).toEqual({
			via: 'bunx',
			preset: 'minimal',
			all: true,
			globalOnly: true,
		});
		expect(parseGlobalArgs(['--via=nope']).options?.via).toBeUndefined();
	});
});

describe('init:global run', () => {
	it('refuses bad arguments with a usage error', async () => {
		const result = await runGlobalInit(['--ide='], contextWith({}));
		expect(result.error).toContain('--ide must contain');
	});

	it('reports when no global target was configured', async () => {
		install.report = reportWith({
			os: fakePartial<IInstallReport['os']>({
				label: 'Linux',
				note: 'WSL',
			}),
		});
		const result = await runGlobalInit([], contextWith({}));
		expect(result.text).toContain('OS: Linux');
		expect(result.text).toContain('  WSL');
		expect(result.text).toContain(
			'No global host targets were configured.',
		);
	});

	it('lists each configured and skipped target', async () => {
		install.report = reportWith({
			ok: false,
			results: [
				fakePartial<IInstallReport['results'][number]>({
					label: 'Cursor',
					action: 'added',
					path: '/profile/.cursor/mcp.json',
				}),
				fakePartial<IInstallReport['results'][number]>({
					label: 'Zed',
					action: 'skipped',
					reason: 'not installed',
					path: '/profile/.config/zed/settings.json',
				}),
			],
		});
		const result = await runGlobalInit([], contextWith({}));
		expect(result.text).toContain('* Cursor [added]');
		expect(result.text).toContain('- Zed [skipped] (not installed)');
		expect(result.text).toContain('without touching project files');
		expect(result.code).not.toBe(0);
	});

	it('returns the report itself as data under json output', async () => {
		install.report = reportWith({});
		const result = await runGlobalInit([], contextWith({ json: true }));
		expect(result.text).toBeUndefined();
		expect(result.code).toBe(0);
	});
});
