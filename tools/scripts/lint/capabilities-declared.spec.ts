/**
 * capabilities-declared.spec.ts — c00137 (Track F / security).
 *
 * Pin the capability-declared lint's three contract surfaces:
 *   1. Source detection — the regex identifies `ctx.capabilities.X.Y(...)`
 *      usage and reports one entry per match.
 *   2. Whitelist parsing — the `// capabilities-pending:` /
 *      `// capabilities-migration-due:` comments are parsed exactly
 *      as written, and the due date is honoured.
 *   3. End-to-end — the lint walks a fixture (synthetic plugins
 *      directory) and returns the expected violation list.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	detectUsageInSource,
	isWhitelistExpired,
	lintCapabilitiesDeclared,
	parseWhitelist,
	readManifestCapabilities,
	splitUsage,
} from './capabilities-declared.script';

let workspace = '';

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'capabilities-declared-'));
});

afterEach(async () => {
	if (workspace.length > 0)
		await rm(workspace, { recursive: true, force: true });
});

const writeFileSafe = async (abs: string, body: string): Promise<void> => {
	await mkdir(dirname(abs), { recursive: true });
	await writeFile(abs, body, 'utf8');
};

describe('c00137 — capabilities-declared lint (Track F)', () => {
	describe('splitUsage', () => {
		it('splits group.action correctly', () => {
			expect(splitUsage('git.write')).toEqual({
				group: 'git',
				action: 'write',
			});
			expect(splitUsage('network.fetch')).toEqual({
				group: 'network',
				action: 'fetch',
			});
		});

		it('rejects malformed inputs', () => {
			expect(splitUsage('git')).toBeNull();
			expect(splitUsage('.write')).toBeNull();
			expect(splitUsage('git.')).toBeNull();
		});
	});

	describe('detectUsageInSource', () => {
		it('detects ctx.capabilities.<group>.<action>', () => {
			const source = `
const x = ctx.capabilities.git.write('foo');
const y = ctx.capabilities.fs.read('/etc/passwd');
`;
			const usages = detectUsageInSource(source, 'p.ts');
			expect(usages).toHaveLength(2);
			expect(usages[0]?.capability).toBe('git:write');
			expect(usages[0]?.group).toBe('git');
			expect(usages[0]?.action).toBe('write');
			expect(usages[1]?.capability).toBe('fs:read');
		});

		it('detects the c alias', () => {
			const source = `c.capabilities.network.fetch('http://x');`;
			const usages = detectUsageInSource(source, 'p.ts');
			expect(usages).toHaveLength(1);
			expect(usages[0]?.capability).toBe('network:fetch');
		});

		it('returns an empty list when no usage matches', () => {
			expect(
				detectUsageInSource('const x = ctx.options.y;', 'p.ts'),
			).toEqual([]);
		});

		it('reports the line number', () => {
			const source = [
				'line one',
				'line two',
				'ctx.capabilities.git.write()',
			].join('\n');
			const usages = detectUsageInSource(source, 'p.ts');
			expect(usages[0]?.line).toBe(3);
		});
	});

	describe('parseWhitelist', () => {
		it('parses the pending + due-date pair', () => {
			const source = [
				'// capabilities-pending: fs:write, network:fetch',
				'// capabilities-migration-due: 2027-01-15',
				'',
				'ctx.capabilities.fs.write("/x");',
			].join('\n');
			const wl = parseWhitelist(source, 'p.ts');
			expect(wl).not.toBeNull();
			expect(wl?.pending).toEqual(['fs:write', 'network:fetch']);
			expect(wl?.dueDate).toBe('2027-01-15');
		});

		it('returns null when no whitelist is declared', () => {
			expect(parseWhitelist('const x = 1;', 'p.ts')).toBeNull();
		});

		it('tolerates missing due date', () => {
			const wl = parseWhitelist(
				'// capabilities-pending: git:write',
				'p.ts',
			);
			expect(wl?.pending).toEqual(['git:write']);
			expect(wl?.dueDate).toBeNull();
		});
	});

	describe('isWhitelistExpired', () => {
		it('expires on the due date (UTC)', () => {
			const today = new Date('2026-09-15T00:00:00Z');
			expect(isWhitelistExpired('2026-09-15', today)).toBe(true);
		});
		it('expires the day AFTER the due date', () => {
			const today = new Date('2026-09-16T00:00:00Z');
			expect(isWhitelistExpired('2026-09-15', today)).toBe(true);
		});
		it('does not expire BEFORE the due date', () => {
			const today = new Date('2026-09-14T23:59:59Z');
			expect(isWhitelistExpired('2026-09-15', today)).toBe(false);
		});
		it('treats malformed dates as expired', () => {
			expect(isWhitelistExpired('not-a-date')).toBe(true);
		});
	});

	describe('readManifestCapabilities', () => {
		it('extracts the literal capability tokens', () => {
			const manifest = `
definePluginManifest({
  id: 'foo',
  capabilities: ['git:read', 'fs:write'],
});
`;
			expect(readManifestCapabilities(manifest)).toEqual([
				'git:read',
				'fs:write',
			]);
		});
		it('returns [] when the manifest has no capabilities', () => {
			expect(
				readManifestCapabilities('definePluginManifest({});'),
			).toEqual([]);
		});
	});

	describe('lintCapabilitiesDeclared (end-to-end on a fixture)', () => {
		const buildFixture = async (): Promise<void> => {
			// Plugin A — fully declared, no violations.
			await writeFileSafe(
				join(workspace, 'plugins', 'clean', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'clean',",
					"  capabilities: ['git:read'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'clean', 'src', 'index.ts'),
				'ctx.capabilities.git.read();\n',
			);

			// Plugin B — used but not declared → violation.
			await writeFileSafe(
				join(workspace, 'plugins', 'dirty', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'dirty',",
					"  capabilities: ['fs:read'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'dirty', 'src', 'index.ts'),
				[
					'ctx.capabilities.fs.read();',
					'ctx.capabilities.network.fetch("http://x");',
				].join('\n'),
			);

			// Plugin C — whitelisted, future date → no violation.
			await writeFileSafe(
				join(workspace, 'plugins', 'whitelist', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'whitelist',",
					"  capabilities: ['git:read'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'whitelist', 'src', 'index.ts'),
				[
					'// capabilities-pending: fs:write',
					'// capabilities-migration-due: 2099-01-01',
					'',
					'ctx.capabilities.fs.write("/x");',
				].join('\n'),
			);

			// Plugin D — whitelisted, past date → violation (expired).
			await writeFileSafe(
				join(workspace, 'plugins', 'expired', 'plugin.manifest.ts'),
				[
					"import { definePluginManifest } from '@delendai/core/public';",
					'export default definePluginManifest({',
					"  id: 'expired',",
					"  capabilities: ['git:read'],",
					'})',
				].join('\n'),
			);
			await writeFileSafe(
				join(workspace, 'plugins', 'expired', 'src', 'index.ts'),
				[
					'// capabilities-pending: fs:write',
					'// capabilities-migration-due: 2020-01-01',
					'',
					'ctx.capabilities.fs.write("/x");',
				].join('\n'),
			);
		};

		it('returns no violations when every plugin is clean or whitelisted', async () => {
			await buildFixture();
			const report = await lintCapabilitiesDeclared(workspace, {
				today: new Date('2026-09-15T00:00:00Z'),
			});
			const filtered = report.violations.filter(
				(v) => v.pluginId !== 'dirty' && v.pluginId !== 'expired',
			);
			expect(filtered).toEqual([]);
		});

		it('flags used-but-not-declared usages', async () => {
			await buildFixture();
			const report = await lintCapabilitiesDeclared(workspace, {
				today: new Date('2026-09-15T00:00:00Z'),
			});
			const dirtyViolations = report.violations.filter(
				(v) => v.pluginId === 'dirty',
			);
			expect(dirtyViolations).toHaveLength(1);
			expect(dirtyViolations[0]?.kind).toBe('used-but-not-declared');
			expect(dirtyViolations[0]?.capability).toBe('network:fetch');
			expect(dirtyViolations[0]?.file).toMatch(/dirty\/src\/index\.ts$/);
		});

		it('flags expired whitelist entries', async () => {
			await buildFixture();
			const report = await lintCapabilitiesDeclared(workspace, {
				today: new Date('2026-09-15T00:00:00Z'),
			});
			const expiredViolations = report.violations.filter(
				(v) => v.pluginId === 'expired',
			);
			expect(expiredViolations).toHaveLength(1);
			expect(expiredViolations[0]?.kind).toBe('whitelist-expired');
			expect(expiredViolations[0]?.note).toMatch(/2020-01-01/);
		});

		it('counts every plugin and every .ts file under src/', async () => {
			await buildFixture();
			const report = await lintCapabilitiesDeclared(workspace);
			expect(report.scannedPlugins).toBe(4);
			// 4 manifest files + 4 src/index.ts + 0 other src files.
			expect(report.scannedFiles).toBe(4);
		});

		it('returns ok=true when there are no violations', async () => {
			await buildFixture();
			// After removing the dirty + expired fixtures the report is ok.
			await rm(join(workspace, 'plugins', 'dirty'), {
				recursive: true,
				force: true,
			});
			await rm(join(workspace, 'plugins', 'expired'), {
				recursive: true,
				force: true,
			});
			const report = await lintCapabilitiesDeclared(workspace);
			expect(report.ok).toBe(true);
		});
	});
});
