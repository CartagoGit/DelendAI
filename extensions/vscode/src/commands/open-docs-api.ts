/**
 * `mcp-vertex.openDocsApi` — surface the documentation / how-to-use / API
 * from inside the IDE (f00053 S6).
 *
 * Where `openDocs` opens the docs home in a webview, this command offers a
 * quick-pick of the CANONICAL doc destinations — the same pages the docs
 * site already ships (Guide, the CLI guide from S5, the Plugins index from
 * S2, the live Tools registry, and the generated API reference) — and opens
 * the chosen one. The content is not re-authored here: each entry deep-links
 * into the canonical page, so there is one source of truth.
 *
 * Security: the chosen URL goes through the same `EmbedService` validation
 * as `openDocs` (rejects http://, localhost and private IPs by default).
 */
import { EmbedService, type IEmbedServiceOptions } from '@mcp-vertex/client';
import { SHARED_UI_STRINGS, escapeHtml } from '@mcp-vertex/ui-extension/public';

import type { ICommandVscodeApi } from './types';

export const OPEN_DOCS_API_COMMAND = 'mcp-vertex.openDocsApi';
// f00053 S7: the docs URL has one source of truth (the shared strings
// module), consumed here instead of re-typed.
export const DEFAULT_DOCS_BASE_URL = SHARED_UI_STRINGS.docsUrl;

export interface IDocsTarget {
	readonly id: string;
	readonly label: string;
	readonly detail: string;
	readonly url: string;
}

export interface IOpenDocsApiOptions extends IEmbedServiceOptions {
	/** Override the docs base URL (default: the production docs site). */
	readonly baseUrl?: string;
}

/**
 * The canonical doc destinations, deep-linked into the docs site. Pure +
 * exported so it is unit-testable without a VS Code runtime.
 */
export const resolveDocsApiTargets = (
	baseUrl: string = DEFAULT_DOCS_BASE_URL,
): readonly IDocsTarget[] => {
	const base = baseUrl.replace(/\/$/, '');
	return [
		{
			id: 'guide',
			label: 'Guide',
			detail: 'Concepts, install, config, extending — the full walkthrough.',
			url: `${base}/guide`,
		},
		{
			id: 'cli',
			label: 'CLI guide',
			detail: 'Global flags, per-plugin command groups, common workflows.',
			url: `${base}/cli`,
		},
		{
			id: 'plugins',
			label: 'Plugins',
			detail: 'What each plugin does and the tools it contributes.',
			url: `${base}/plugins`,
		},
		{
			id: 'tools',
			label: 'Tools',
			detail: 'The live tool registry across all loaded plugins.',
			url: `${base}/tools`,
		},
		{
			id: 'api',
			label: 'API reference',
			detail: 'The generated @mcp-vertex/core API docs.',
			url: `${base}/api/`,
		},
	];
};

const buildHtml = (target: IDocsTarget): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex — ${escapeHtml(target.label)}</title>
	<style>
		body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		header { padding: 8px 12px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 11px; color: var(--vscode-description-foreground); }
		iframe { width: 100%; height: calc(100vh - 32px); border: 0; }
	</style>
</head>
<body>
	<header>${escapeHtml(target.label)} — embedded from <a href="${escapeHtml(target.url)}">${escapeHtml(target.url)}</a></header>
	<iframe src="${escapeHtml(target.url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
</body>
</html>`;

export const registerOpenDocsApiCommand = (deps: {
	vscode: ICommandVscodeApi;
	options?: IOpenDocsApiOptions;
}) =>
	deps.vscode.commands.registerCommand(OPEN_DOCS_API_COMMAND, async () => {
		const targets = resolveDocsApiTargets(deps.options?.baseUrl);
		const picked = await deps.vscode.window.showQuickPick?.(
			targets.map((t) => ({
				id: t.id,
				label: t.label,
				detail: t.detail,
			})),
		);
		// The quick-pick wrapper returns the selected id (or label). Fall
		// back to the first target if the user dismissed the picker.
		const target =
			targets.find((t) => t.id === picked || t.label === picked) ??
			targets[0];
		if (target === undefined) return undefined;

		const embed = new EmbedService(deps.options ?? {});
		const validation = embed.validate(target.url);
		if (!validation.ok) {
			await deps.vscode.window.showInformationMessage?.(
				`mcp-vertex: docs URL rejected (${validation.reason ?? 'unknown'}).`,
			);
			return undefined;
		}
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexDocsApi',
			`mcp-vertex — ${target.label}`,
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = buildHtml(target);
		return panel;
	});
