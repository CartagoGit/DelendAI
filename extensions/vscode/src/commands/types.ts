import type { IMcpLogHint, McpStdioClient } from '@mcp-vertex/client';

import type { IDisposable, IWebviewPanel } from '../extension';
import type { MemoryTreeDataProvider } from '../providers/memory-tree-data-provider';
import type { ToolTreeDataProvider } from '../providers/tool-tree-data-provider';

/** Minimal `vscode.Uri` surface this module needs (f00045 S3). */
export interface IVscodeUri {
	with(change: { readonly fragment?: string }): IVscodeUri;
}

export interface ICommandVscodeApi {
	readonly ViewColumn: {
		readonly One: number;
	};
	readonly commands: {
		registerCommand(
			command: string,
			callback: (...args: readonly unknown[]) => unknown,
		): IDisposable;
		/** Dispatch a built-in command (e.g. `vscode.open`). f00045 S3. */
		executeCommand?(
			command: string,
			...args: readonly unknown[]
		): Thenable<unknown>;
	};
	/** `vscode.Uri` factory, used to build the "Open log" target. f00045 S3. */
	readonly Uri?: {
		file(path: string): IVscodeUri;
	};
	readonly window: {
		createWebviewPanel(
			viewType: string,
			title: string,
			showOptions: number,
			options: { readonly enableScripts?: boolean },
		): IWebviewPanel;
		showInformationMessage?(message: string): Thenable<string | undefined>;
		showErrorMessage?(
			message: string,
			...actions: readonly string[]
		): Thenable<string | undefined>;
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

/** Duck-typed log-hint guard — robust across the client package boundary. */
const logHintOf = (err: unknown): IMcpLogHint | undefined => {
	const hint = (err as { readonly logHint?: unknown })?.logHint;
	if (
		typeof hint === 'object' &&
		hint !== null &&
		typeof (hint as Record<string, unknown>).path === 'string' &&
		typeof (hint as Record<string, unknown>).line === 'number' &&
		typeof (hint as Record<string, unknown>).ts === 'string'
	) {
		return hint as IMcpLogHint;
	}
	return undefined;
};

export interface ICommandDeps {
	readonly vscode: ICommandVscodeApi;
	readonly client: McpStdioClient;
	readonly toolTree?: Pick<ToolTreeDataProvider, 'refresh'>;
	readonly memoryTree?: Pick<MemoryTreeDataProvider, 'refresh'>;
	/** Optional host persistence layer (f00050 S7). Used by commands that
	 * resolve the user's preferred language from `mv:lang`. */
	readonly globalState?: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void> | Promise<void>;
	};
	/** Plugin names the host actually loaded at activation (f00059 S3).
	 * The toolbar uses this to drop action cards whose `requires` lists a
	 * plugin that is NOT in the set, so users only see actions that
	 * resolve. Omitted → every action is shown (legacy behaviour). */
	readonly loadedPlugins?: readonly string[];
}

export const showCommandError = async (
	vscode: ICommandVscodeApi,
	action: string,
	err: unknown,
): Promise<void> => {
	const detail = err instanceof Error ? err.message : String(err);
	const message = `mcp-vertex: ${action} failed: ${detail}`;

	// f00045 S3: when the failure carries a `logHint` (the server
	// persisted the event and the client transport attached it to the
	// McpToolError), offer a one-click "Open log" action that jumps to
	// the exact JSONL line. The handlers never have to thread the hint
	// through — it rides on the thrown error.
	const hint = logHintOf(err);
	if (
		hint !== undefined &&
		vscode.Uri !== undefined &&
		vscode.commands.executeCommand !== undefined
	) {
		const choice = await vscode.window.showErrorMessage?.(
			message,
			'Open log',
		);
		if (choice === 'Open log') {
			const target = vscode.Uri.file(hint.path).with({
				fragment: `L${hint.line}`,
			});
			await vscode.commands.executeCommand('vscode.open', target);
		}
		return;
	}

	await vscode.window.showErrorMessage?.(message);
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
