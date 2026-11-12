/**
 * user-host-config.migrator.spec.ts — the user-level host configs: where
 * they are, what is rewritten, what is only asked about, and the backup.
 */
import { describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/lib/config/jsonc-document';
import type { ILegacyResidueIO } from '@delendai/core/lib/contracts/interfaces/legacy-residue.interface';
import { resolveUserConfigPaths } from '@delendai/core/lib/workspace-migration/host-scope/user-config-paths.helper';
import { migrateUserHostConfigs } from '@delendai/core/lib/workspace-migration/host-scope/user-host-config.migrator';

const memory = (
	files: Map<string, string>,
	failBackups = false,
): ILegacyResidueIO => ({
	readText: async (path) => files.get(path),
	writeText: async (path, text) => {
		if (failBackups && path.endsWith('.bak')) throw new Error('disk full');
		files.set(path, text);
	},
});

const env = {
	platform: 'linux',
	home: '/h',
	windowsHomes: ['/mnt/c/Users/ana'],
} as const;
const run = (files: Map<string, string>, failBackups = false) =>
	migrateUserHostConfigs({
		resolved: resolveUserConfigPaths(env),
		io: memory(files, failBackups),
		backupDir: '/h/state/backups',
		now: () => new Date('2026-11-12T10:00:00.000Z'),
	});

const OLD_JSON =
	'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["--config=/p/mcp-vertex.config.json"]}}}';

describe('the user-level config paths', () => {
	it('[<20ms] covers Linux, WSL and Windows for VS Code and names hosts without a file', () => {
		const linux = resolveUserConfigPaths(env);
		const paths = linux.files.map((file) => file.path);
		expect(paths).toContain('/h/.codex/config.toml');
		expect(paths).toContain('/h/.claude.json');
		expect(paths).toContain('/h/.mcp.json');
		expect(paths).toContain('/h/.config/Code/User/mcp.json');
		expect(paths).toContain(
			'/mnt/c/Users/ana/AppData/Roaming/Code/User/settings.json',
		);
		expect(linux.notCovered).toContain('windsurf');
		const windows = resolveUserConfigPaths({
			platform: 'win32',
			home: 'C:/Users/ana',
			appData: 'C:/Users/ana/AppData/Roaming',
		});
		expect(windows.files.map((file) => file.path)).toContain(
			'C:/Users/ana/AppData/Roaming/Code/User/mcp.json',
		);
	});
});

describe('the user-level host config migrator', () => {
	it('[<20ms] rewrites an old-name entry, backs the file up first, and is idempotent', async () => {
		const files = new Map([['/h/.claude.json', OLD_JSON]]);
		const first = await run(files);
		expect(first.changes).toHaveLength(1);
		const change = first.changes[0];
		expect(files.get(change?.backup ?? '')).toBe(OLD_JSON);
		expect(change?.backup).toContain('2026-11-12T10-00-00-000Z');
		expect(files.get('/h/.claude.json')).toContain('"delendai"');
		expect(files.get('/h/.claude.json')).toContain('delendai.config.json');
		const second = await run(files);
		expect(second.changes).toEqual([]);
	});

	it('[<20ms] keeps comments, unrelated keys and a foreign entry byte for byte, and asks about it', async () => {
		const foreign =
			'"mine": {"command":"node","args":["/old/mcp-vertex/run.js"]}';
		const text = `{\n\t// my settings\n\t"theme": "dark",\n\t"mcpServers": {\n\t\t${foreign},\n\t\t"mcp-vertex": {"command":"bun"}\n\t}\n}`;
		const files = new Map([['/h/.claude.json', text]]);
		const report = await run(files);
		const next = files.get('/h/.claude.json') ?? '';
		expect(next).toContain('// my settings');
		expect(next).toContain('"theme": "dark"');
		expect(parseJsonc(next).value).toMatchObject({
			mcpServers: {
				mine: { command: 'node', args: ['/old/mcp-vertex/run.js'] },
			},
		});
		expect(report.questions).toEqual([
			{ hostId: 'claude', file: '/h/.claude.json', entry: 'mine' },
		]);
	});

	it('[<20ms] leaves a file with only a foreign entry byte for byte and asks about it', async () => {
		const text =
			'{ // kept\n"mcpServers": {"mine": {"args":["/old/mcp-vertex/run.js"]}} }';
		const files = new Map([['/h/.claude.json', text]]);
		const report = await run(files);
		expect(files.get('/h/.claude.json')).toBe(text);
		expect(report.questions).toHaveLength(1);
		expect(report.changes).toEqual([]);
	});

	it('[<20ms] rewrites a Codex table and leaves the other tables alone', async () => {
		const toml =
			'model = "x"\n# note\n[mcp_servers.mcp-vertex]\ncommand = "bun"\nargs = ["--config=/p/mcp-vertex.config.json"]\n\n[mcp_servers.other]\ncommand = "node"\n';
		const files = new Map([['/h/.codex/config.toml', toml]]);
		const report = await run(files);
		const next = files.get('/h/.codex/config.toml') ?? '';
		expect(report.changes[0]?.entries).toEqual(['mcp-vertex']);
		expect(next).toContain('[mcp_servers.delendai]');
		expect(next).toContain('# note');
		expect(next).toContain('[mcp_servers.other]\ncommand = "node"\n');
		expect(next).not.toContain('mcp-vertex');
	});

	it('[<20ms] leaves a clean file untouched and reports no backup', async () => {
		const clean = '{"mcpServers":{"delendai":{"command":"bun"}}}';
		const files = new Map([['/h/.claude.json', clean]]);
		const report = await run(files);
		expect(report.changes).toEqual([]);
		expect(files.get('/h/.claude.json')).toBe(clean);
		expect(files.size).toBe(1);
	});

	it('[<20ms] aborts the edit when the backup cannot be written', async () => {
		const files = new Map([['/h/.claude.json', OLD_JSON]]);
		const report = await run(files, true);
		expect(files.get('/h/.claude.json')).toBe(OLD_JSON);
		expect(report.changes).toEqual([]);
		expect(report.failures[0]?.reason).toBe('disk full');
	});

	it('[<20ms] reports an unparsable file and carries on with the others', async () => {
		const files = new Map([
			['/h/.claude.json', '{ not json'],
			['/h/.mcp.json', OLD_JSON],
		]);
		const report = await run(files);
		expect(report.failures.map((failure) => failure.file)).toEqual([
			'/h/.claude.json',
		]);
		expect(report.changes.map((change) => change.file)).toEqual([
			'/h/.mcp.json',
		]);
	});
});
