import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** What the built extension sees of the editor: it records the views it registers. */
const FAKE_VSCODE = `const views = (globalThis.__views = {});
const d = { dispose() {} };
class EventEmitter { constructor(){ this.event = () => d; } fire(){} dispose(){} }
class TreeItem { constructor(l, s){ this.label = l; this.collapsibleState = s; } }
class ThemeIcon { constructor(id){ this.id = id; } }
module.exports = {
  version: '1.90.0', EventEmitter, TreeItem, ThemeIcon,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ViewColumn: { One: 1 }, StatusBarAlignment: { Left: 1, Right: 2 },
  commands: { registerCommand: () => d, executeCommand: async () => undefined },
  window: {
    createOutputChannel: () => ({ append(){}, appendLine(){}, dispose(){}, show(){} }),
    createStatusBarItem: () => ({ show(){}, hide(){}, dispose(){} }),
    registerTreeDataProvider: (id, p) => { views[id] = p; return d; },
    registerWebviewViewProvider: () => d,
    showErrorMessage: async () => undefined, showInformationMessage: async () => undefined,
    createWebviewPanel: () => ({ webview: { html: '' }, onDidDispose: () => d }),
  },
  workspace: {
    isTrusted: true,
    workspaceFolders: [{ uri: { fsPath: process.env.PROJECT_ROOT }, name: 'p' }],
    getConfiguration: () => ({ get: () => undefined }),
    onDidChangeConfiguration: () => d,
    createFileSystemWatcher: () => ({ onDidChange: () => d, onDidCreate: () => d, onDidDelete: () => d, dispose(){} }),
  },
  env: {}, Uri: { file: (p) => ({ fsPath: p }) },
};
`;

/** Activates the built bundle, then reads the Tools view the way the editor would. */
const ACTIVATE_AND_READ = `const ext = await import('./extension.js');
const ctx = { subscriptions: [], globalState: { get: () => undefined, update: async () => {} } };
await ext.activate(ctx);
const view = globalThis.__views['delendai.tools'];
const kids = (await view.getChildren()) ?? [];
console.log(JSON.stringify({ labels: kids.map((kid) => String(kid.label)) }));
await ext.deactivate();
process.exit(0);
`;

const REPOSITORY_ROOT = join(EXTENSION_ROOT, '../..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe('VS Code extension against a real server', () => {
	it('[<10000ms] activates against a real server in a throwaway project and reads a populated view', async () => {
		const outdir = await mkdtemp(join(tmpdir(), 'delendai-vscode-live-'));
		const project = await mkdtemp(
			join(tmpdir(), 'delendai-vscode-project-'),
		);
		temporaryDirectories.push(outdir, project);
		const built = spawnSync(
			'bun',
			['scripts/build.ts', '--outdir', outdir],
			{ cwd: EXTENSION_ROOT, encoding: 'utf8' },
		);
		expect(built.status, built.stderr || built.stdout).toBe(0);
		await mkdir(join(outdir, 'node_modules/vscode'), { recursive: true });
		await writeFile(
			join(outdir, 'node_modules/vscode/index.js'),
			FAKE_VSCODE,
		);
		await writeFile(join(outdir, 'run.mjs'), ACTIVATE_AND_READ);
		await writeFile(join(project, 'delendai.config.json'), '{}');
		// The entry is spelled `DelendAI`: the lookup must not care about case.
		await writeFile(
			join(project, '.mcp.json'),
			JSON.stringify({
				mcpServers: {
					DelendAI: {
						type: 'stdio',
						command: 'bun',
						args: [
							join(
								REPOSITORY_ROOT,
								'tools/scripts/host/host-server.script.ts',
							),
							'--workspace=.',
						],
					},
				},
			}),
		);

		const run = spawnSync('node', [join(outdir, 'run.mjs')], {
			cwd: project,
			encoding: 'utf8',
			env: { ...process.env, PROJECT_ROOT: project },
			timeout: 8_000,
		});

		expect(run.status, run.stderr).toBe(0);
		const { labels } = JSON.parse(
			run.stdout.trim().split('\n').pop() ?? '{}',
		) as {
			labels: string[];
		};
		expect(labels.length).toBeGreaterThan(0);
		expect(labels.join(' ')).not.toMatch(/connecting/iu);
	});
});
