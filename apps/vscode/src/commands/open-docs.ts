/**
 * `mcp-vertex.openDocs` — opens the configured docs URL in a
 * dedicated webview panel. Defaults to the production docs site
 * (`https://mcp-vertex.dev`); override via
 * `mcp-vertex.config.json#extension.docsUrl`.
 *
 * Security: `EmbedService` rejects http://, localhost, and private IPs
 * by default (toggle via `allowLocalhost` / `allowPrivateIps`). On
 * rejection we surface an error message instead of opening a panel.
 */
import { EmbedService, type IEmbedServiceOptions } from '@mcp-vertex/client';
import { escapeHtml } from '@mcp-vertex/ide/public';

import type { ICommandVscodeApi } from './types';

export const OPEN_DOCS_COMMAND = 'mcp-vertex.openDocs';

export interface IOpenDocsOptions extends IEmbedServiceOptions {
	readonly fallbackUrl?: string;
}

const buildHtml = (url: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Docs</title>
	<style>
		body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		header { padding: 8px 12px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 11px; color: var(--vscode-description-foreground); }
		iframe { width: 100%; height: calc(100vh - 32px); border: 0; }
	</style>
</head>
<body>
	<header>Embedded from <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></header>
	<iframe src="${escapeHtml(url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
</body>
</html>`;

export const registerOpenDocsCommand = (
	deps: { vscode: ICommandVscodeApi; options?: IOpenDocsOptions },
) =>
	deps.vscode.commands.registerCommand(OPEN_DOCS_COMMAND, async () => {
		const embed = new EmbedService(deps.options ?? {});
		const url = deps.options?.fallbackUrl ?? 'https://mcp-vertex.dev';
		const validation = embed.validate(url);
		if (!validation.ok) {
			await deps.vscode.window.showInformationMessage?.(
				`mcp-vertex: docs URL rejected (${validation.reason ?? 'unknown'}).`,
			);
			return undefined;
		}
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexDocs',
			'mcp-vertex Docs',
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = buildHtml(url);
		return panel;
	});
