import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildServerEntry,
	detectOs,
	installToTarget,
	runInstall,
	targetById,
} from '@mcp-vertex/core/public';

describe('IDE installer (M39)', async () => {
	let dir = '';
	const env = () => ({
		projectDir: dir,
		home: dir,
		platform: 'linux' as const,
		appData: undefined,
	});
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'install-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('buildServerEntry maps the runner (npx/bunx/deno) and adds type:stdio for VS Code', async () => {
		const vscode = targetById('vscode')!;
		expect(buildServerEntry(vscode, { via: 'npx' })).toEqual({
			type: 'stdio',
			command: 'npx',
			args: ['-y', '@mcp-vertex/core', '--preset=standard'],
		});
		const cursor = targetById('cursor')!;
		expect(
			buildServerEntry(cursor, { via: 'bunx', preset: 'swarm' }),
		).toEqual({
			command: 'bunx',
			args: ['@mcp-vertex/core', '--preset=swarm'],
		});
		expect(buildServerEntry(cursor, { via: 'deno' }).args).toContain(
			'npm:@mcp-vertex/core',
		);
	});

	it('installToTarget creates the VS Code config with the servers/type:stdio shape', async () => {
		const r = await installToTarget(targetById('vscode')!, env(), {
			via: 'npx',
		});
		expect(r.action).toBe('created');
		const cfg = JSON.parse(
			readFileSync(join(dir, '.vscode/mcp.json'), 'utf8'),
		);
		expect(cfg.servers['mcp-vertex'].type).toBe('stdio');
	});

	it('installToTarget creates the Zed config with the context_servers shape', async () => {
		const r = await installToTarget(targetById('zed')!, env(), {
			via: 'npx',
		});
		expect(r.action).toBe('created');
		expect(r.path).toBe(join(dir, '.config/zed/settings.json'));
		const cfg = JSON.parse(
			readFileSync(join(dir, '.config/zed/settings.json'), 'utf8'),
		);
		expect(cfg.context_servers['mcp-vertex']).toEqual({
			command: 'npx',
			args: ['-y', '@mcp-vertex/core', '--preset=standard'],
		});
		expect(cfg.context_servers['mcp-vertex'].type).toBeUndefined();
	});

	it('merges into an existing config without removing the user’s servers', async () => {
		mkdirSync(join(dir, '.cursor'), { recursive: true });
		writeFileSync(
			join(dir, '.cursor/mcp.json'),
			JSON.stringify({ mcpServers: { existing: { command: 'foo' } } }),
		);
		const r = await installToTarget(targetById('cursor')!, env(), {});
		expect(r.action).toBe('added');
		const cfg = JSON.parse(
			readFileSync(join(dir, '.cursor/mcp.json'), 'utf8'),
		);
		expect(cfg.mcpServers.existing).toEqual({ command: 'foo' }); // preserved
		expect(cfg.mcpServers['mcp-vertex']).toBeDefined();
	});

	it('merges Zed config without removing unrelated agent settings', async () => {
		mkdirSync(join(dir, '.config/zed'), { recursive: true });
		writeFileSync(
			join(dir, '.config/zed/settings.json'),
			JSON.stringify({
				agent: { tool_permissions: { default: 'allow' } },
				context_servers: {
					existing: { command: 'foo', args: ['bar'] },
				},
			}),
		);
		const r = await installToTarget(targetById('zed')!, env(), {});
		expect(r.action).toBe('added');
		const cfg = JSON.parse(
			readFileSync(join(dir, '.config/zed/settings.json'), 'utf8'),
		);
		expect(cfg.agent.tool_permissions.default).toBe('allow');
		expect(cfg.context_servers.existing).toEqual({
			command: 'foo',
			args: ['bar'],
		});
		expect(cfg.context_servers['mcp-vertex']).toBeDefined();
	});

	it('auto-detects targets whose signal dir exists', async () => {
		mkdirSync(join(dir, '.vscode'), { recursive: true });
		const report = await runInstall(env(), {});
		expect(report.detected).toBe(true);
		expect(report.results.map((r) => r.id)).toContain('vscode');
		// Claude Desktop (no signal here) is not auto-written.
		expect(report.results.map((r) => r.id)).not.toContain('claude-desktop');
	});

	it('detectOs distinguishes WSL from native Linux/macOS/Windows', async () => {
		expect(detectOs('darwin').id).toBe('macos');
		expect(detectOs('win32').id).toBe('windows');
		expect(detectOs('linux', false).id).toBe('linux');
		const wsl = detectOs('linux', true);
		expect(wsl.id).toBe('wsl');
		expect(wsl.label).toMatch(/WSL/);
		expect(wsl.note).toMatch(/mnt\/c/);
	});

	it('report carries the detected OS', async () => {
		const report = await runInstall(
			{ ...env(), isWsl: true },
			{ ide: ['claude-code'] },
		);
		expect(report.os.id).toBe('wsl');
	});

	it('explicit --ide list installs exactly those', async () => {
		const report = await runInstall(env(), { ide: ['claude-code'] });
		expect(report.results.map((r) => r.id)).toEqual(['claude-code']);
		expect(report.results[0]?.action).toBe('created');
	});

	it('explicit --ide list can install Zed', async () => {
		const report = await runInstall(env(), { ide: ['zed'] });
		expect(report.results.map((r) => r.id)).toEqual(['zed']);
		expect(report.results[0]?.action).toBe('created');
	});
});
