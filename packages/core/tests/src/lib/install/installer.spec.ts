import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildServerEntry,
	installToTarget,
	runInstall,
	targetById,
} from '@mcp-vertex/core/public';

describe('IDE installer (M39)', () => {
	let dir = '';
	const env = () => ({ projectDir: dir, home: dir, platform: 'linux' as const, appData: undefined });
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'install-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('buildServerEntry maps the runner (npx/bunx/deno) and adds type:stdio for VS Code', () => {
		const vscode = targetById('vscode')!;
		expect(buildServerEntry(vscode, { via: 'npx' })).toEqual({
			type: 'stdio',
			command: 'npx',
			args: ['-y', '@mcp-vertex/core', '--preset=standard'],
		});
		const cursor = targetById('cursor')!;
		expect(buildServerEntry(cursor, { via: 'bunx', preset: 'swarm' })).toEqual({
			command: 'bunx',
			args: ['@mcp-vertex/core', '--preset=swarm'],
		});
		expect(buildServerEntry(cursor, { via: 'deno' }).args).toContain('npm:@mcp-vertex/core');
	});

	it('installToTarget creates the VS Code config with the servers/type:stdio shape', async () => {
		const r = await installToTarget(targetById('vscode')!, env(), { via: 'npx' });
		expect(r.action).toBe('created');
		const cfg = JSON.parse(readFileSync(join(dir, '.vscode/mcp.json'), 'utf8'));
		expect(cfg.servers['mcp-vertex'].type).toBe('stdio');
	});

	it('merges into an existing config without removing the user’s servers', async () => {
		mkdirSync(join(dir, '.cursor'), { recursive: true });
		writeFileSync(
			join(dir, '.cursor/mcp.json'),
			JSON.stringify({ mcpServers: { existing: { command: 'foo' } } })
		);
		const r = await installToTarget(targetById('cursor')!, env(), {});
		expect(r.action).toBe('added');
		const cfg = JSON.parse(readFileSync(join(dir, '.cursor/mcp.json'), 'utf8'));
		expect(cfg.mcpServers.existing).toEqual({ command: 'foo' }); // preserved
		expect(cfg.mcpServers['mcp-vertex']).toBeDefined();
	});

	it('auto-detects targets whose signal dir exists', async () => {
		mkdirSync(join(dir, '.vscode'), { recursive: true });
		const report = await runInstall(env(), {});
		expect(report.detected).toBe(true);
		expect(report.results.map((r) => r.id)).toContain('vscode');
		// Claude Desktop (no signal here) is not auto-written.
		expect(report.results.map((r) => r.id)).not.toContain('claude-desktop');
	});

	it('explicit --ide list installs exactly those', async () => {
		const report = await runInstall(env(), { ide: ['claude-code'] });
		expect(report.results.map((r) => r.id)).toEqual(['claude-code']);
		expect(report.results[0]?.action).toBe('created');
	});
});
