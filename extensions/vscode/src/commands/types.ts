import type { McpStdioClient } from '@mcp-vertex/client';

import type { IDisposable, IWebviewPanel } from '../extension';
import type { MemoryTreeDataProvider } from '../providers/memory-tree-data-provider';
import type { ToolTreeDataProvider } from '../providers/tool-tree-data-provider';

export interface ICommandVscodeApi {
	readonly ViewColumn: {
		readonly One: number;
	};
	readonly commands: {
		registerCommand(
			command: string,
			callback: (...args: readonly unknown[]) => unknown,
		): IDisposable;
	};
	readonly window: {
		createWebviewPanel(
			viewType: string,
			title: string,
			showOptions: number,
			options: { readonly enableScripts?: boolean },
		): IWebviewPanel;
		showInformationMessage?(message: string): Thenable<string | undefined>;
		showErrorMessage?(message: string): Thenable<string | undefined>;
		showQuickPick?(
			items: ReadonlyArray<{
				readonly id: string;
				readonly label: string;
				readonly description?: string;
				readonly detail?: string;
			}>,
		): Thenable<string | undefined>;
	};
}

export interface ICommandDeps {
	readonly vscode: ICommandVscodeApi;
	readonly client: McpStdioClient;
	readonly toolTree?: Pick<ToolTreeDataProvider, 'refresh'>;
	readonly memoryTree?: Pick<MemoryTreeDataProvider, 'refresh'>;
}

export const showCommandError = async (
	vscode: ICommandVscodeApi,
	action: string,
	err: unknown,
): Promise<void> => {
	const detail = err instanceof Error ? err.message : String(err);
	await vscode.window.showErrorMessage?.(
		`mcp-vertex: ${action} failed: ${detail}`,
	);
};

export const renderJsonHtml = (
	title: string,
	payload: object,
): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(title)}</title>
</head>
<body>
	<h1>${escapeHtml(title)}</h1>
	<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
</body>
</html>`;

export const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
