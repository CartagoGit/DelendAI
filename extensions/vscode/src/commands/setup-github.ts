/**
 * `mcp-vertex.setupGithub` — opens the multi-step setup-github webview
 * (f00030 S4). The webview mirrors the web wizard
 * (`apps/web/src/pages/setup.astro`) and the canonical 7-step guide in
 * `docs/CROSS-PROJECT-SETUP.md`: 7 steps, one per screen, each with a
 * Back / Next / Copy-command control. State lives in the webview; closing it
 * forgets the state (no persistence beyond what `issues_setup_github` writes
 * to disk).
 *
 * This command is pure UI over the setup steps — no GitHub vocabulary leaks
 * into the extension host or core. The HTML is produced by the testable
 * `renderSetupGithubWebview(...)`; the copy is resolved per language from the
 * shared i18n surface.
 */
import { defaultLang, type Lang } from '../i18n';
import { setupGithubStrings } from '../i18n/strings';
import { renderSetupGithubWebview } from '../webviews/setup-github';

import type { ICommandDeps } from './types';

export const SETUP_GITHUB_COMMAND = 'mcp-vertex.setupGithub';

const SETUP_GITHUB_VIEW_TYPE = 'mcpVertexSetupGithub';

export const registerSetupGithubCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(SETUP_GITHUB_COMMAND, () => {
		// TODO(f00047): read the host's persisted language from
		// `globalState['mv:lang']` when it ships; default to English for now.
		const lang: Lang = defaultLang;
		const strings = setupGithubStrings(lang);
		const html = renderSetupGithubWebview(strings);
		const panel = deps.vscode.window.createWebviewPanel(
			SETUP_GITHUB_VIEW_TYPE,
			strings.title,
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = html;
		return panel;
	});
