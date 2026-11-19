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
const api = {
  version: '1.90.0', EventEmitter, TreeItem, ThemeIcon,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ViewColumn: { One: 1 }, StatusBarAlignment: { Left: 1, Right: 2 },
  commands: { registerCommand: () => d, executeCommand: async () => undefined },
  window: {
    createOutputChannel: () => ({ append(){}, appendLine(){}, dispose(){}, show(){} }),
    createStatusBarItem: () => ({ show(){}, hide(){}, dispose(){} }),
    registerTreeDataProvider: (id, p) => { views[id] = p; return d; },
    registerWebviewViewProvider: (id, p) => { views[id] = p; return d; },
    showErrorMessage: async (m) => { console.error(m); }, showInformationMessage: async () => undefined,
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
// Spelled out so node's ESM interop sees each name as a named export.
exports.commands = api.commands; exports.window = api.window; exports.workspace = api.workspace; exports.env = api.env; exports.Uri = api.Uri;
exports.EventEmitter = api.EventEmitter; exports.TreeItem = api.TreeItem; exports.ThemeIcon = api.ThemeIcon; exports.TreeItemCollapsibleState = api.TreeItemCollapsibleState;
exports.ViewColumn = api.ViewColumn; exports.StatusBarAlignment = api.StatusBarAlignment; exports.version = api.version;
`;

/** Activates the built bundle, then reads the Tools view the way the editor would. */
const ACTIVATE_AND_READ = `const ext = await import('./extension.js');
const ctx = { subscriptions: [], globalState: { get: () => undefined, update: async () => {} } };
await ext.activate(ctx);
const provider = globalThis.__views['delendai.dashboard'];
let html = '';
let onHtml = () => {};
const toolsSection = () => {
  const start = html.indexOf('id="panel-tools"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start));
};
const countRows = () => toolsSection().split('<tr data-tool=').length - 1;
// The dashboard fills its Tools section from the server: resolve once it shows rows.
const populated = new Promise((resolve) => { onHtml = () => { if (countRows() > 0) resolve(); }; });
const webview = {
  options: {}, cspSource: 'vscode-resource:',
  get html() { return html; }, set html(v) { html = v; onHtml(); },
  onDidReceiveMessage: () => ({ dispose() {} }),
  postMessage: async () => true,
  asWebviewUri: (u) => u,
};
await provider.resolveWebviewView({ viewType: 'delendai.dashboard', webview, visible: true, show() {}, onDidDispose: () => ({ dispose() {} }) });
await populated;
console.log(JSON.stringify({ rows: countRows(), connecting: toolsSection().toLowerCase().includes('connecting') }));
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
		const { rows, connecting } = JSON.parse(
			run.stdout.trim().split('\n').pop() ?? '{}',
		) as { rows: number; connecting: boolean };
		expect(rows, run.stderr).toBeGreaterThan(0);
		expect(connecting).toBe(false);
	});
});
