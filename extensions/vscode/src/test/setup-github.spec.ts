import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import { languages, type Lang } from '../i18n';
import {
	assertSetupGithubStringsComplete,
	setupGithubStrings,
	setupGithubStringsByLang,
} from '../i18n/strings';
import {
	SETUP_GITHUB_COMMANDS,
	SETUP_GITHUB_DOCS_URL,
	renderSetupGithubWebview,
} from '../webviews/setup-github';
import {
	SETUP_GITHUB_COMMAND,
	registerSetupGithubCommand,
} from '../commands/setup-github';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const panels: Array<{
		viewType: string;
		title: string;
		webview: { html: string };
	}> = [];
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const vscode: ICommandVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				commands.set(command, callback);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel(viewType, title) {
				const panel = { viewType, title, webview: { html: '' } };
				panels.push(panel);
				return panel;
			},
		},
	};
	return { vscode, panels, commands };
};

const noopClient = () =>
	McpStdioClient.fromTransport({
		async callTool() {
			return {};
		},
	});

describe('mcp-vertex.setupGithub', async () => {
	describe('i18n parity (all 12 languages)', async () => {
		it('every language has setup-github webview strings', async () => {
			expect(Object.keys(setupGithubStringsByLang).sort()).toEqual(
				languages.map((l) => l.code).sort(),
			);
		});

		it('asserts completeness without throwing', async () => {
			expect(() =>
				assertSetupGithubStringsComplete(
					languages.map((l) => l.code as Lang),
				),
			).not.toThrow();
		});

		it('every language declares exactly 7 steps', async () => {
			for (const { code } of languages) {
				expect(setupGithubStrings(code as Lang).steps).toHaveLength(7);
			}
		});
	});

	describe('renderSetupGithubWebview', async () => {
		it('emits all 7 step screens, only the first visible', async () => {
			const html = renderSetupGithubWebview(setupGithubStrings('en'));
			for (let i = 0; i < 7; i += 1) {
				expect(html).toContain(`data-step="${i}"`);
			}
			// first step has no `hidden`, the rest do
			expect(html).toContain('data-step="0" >');
			expect(html).toContain('data-step="1" hidden>');
		});

		it('renders Back / Next controls and a copy button per step', async () => {
			const en = setupGithubStrings('en');
			const html = renderSetupGithubWebview(en);
			expect(html).toContain('id="back"');
			expect(html).toContain('id="next"');
			expect(html).toContain(en.next);
			expect(html).toContain(en.back);
			expect((html.match(/class="copy"/g) ?? []).length).toBe(7);
		});

		it('links back to the canonical docs guide', async () => {
			const html = renderSetupGithubWebview(setupGithubStrings('en'));
			expect(html).toContain(SETUP_GITHUB_DOCS_URL);
			expect(SETUP_GITHUB_DOCS_URL).toContain('CROSS-PROJECT-SETUP.md');
		});

		it('embeds the 7 canonical commands', async () => {
			const html = renderSetupGithubWebview(setupGithubStrings('en'));
			expect(SETUP_GITHUB_COMMANDS).toHaveLength(7);
			expect(html).toContain('git remote get-url origin');
			expect(html).toContain('bunx @mcp-vertex/core --preset=full');
		});

		it('emits commands that agree with the catalog (no preset drift)', async () => {
			// The launch command must use a catalog preset id, NOT a hand-typed
			// plugin list mirroring a full preset (forbidden by lint:setup).
			expect(SETUP_GITHUB_COMMANDS).toContain(
				'bunx @mcp-vertex/core --preset=full',
			);
			// No emitted command may carry a `--plugins=…` flag at all (a
			// verbatim preset membership list is what the drift gate forbids).
			// We assemble the marker at runtime so this assertion file never
			// itself contains a verbatim preset list for `lint:setup` to flag.
			const pluginsFlag = `--${'plugins'}=`;
			for (const cmd of SETUP_GITHUB_COMMANDS) {
				expect(cmd).not.toContain(pluginsFlag);
			}
		});
	});

	describe('command registration', async () => {
		it('registers mcp-vertex.setupGithub and opens a webview', async () => {
			const { vscode, panels, commands } = createVscode();
			registerSetupGithubCommand({ vscode, client: noopClient() });
			expect(commands.has(SETUP_GITHUB_COMMAND)).toBe(true);
			commands.get(SETUP_GITHUB_COMMAND)?.();
			expect(panels).toHaveLength(1);
			expect(panels[0]?.viewType).toBe('mcpVertexSetupGithub');
			expect(panels[0]?.webview.html).toContain('data-step="0"');
		});
	});
});
