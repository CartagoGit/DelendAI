/**
 * `VscodeHostAdapter` — concrete `IHostAdapter` implementation that
 * binds the IDE-agnostic UI shell (`@mcp-vertex/ide`) to the real
 * `vscode` module. **This is the only file in `apps/vscode/` that
 * imports `vscode`**; every other module imports `@mcp-vertex/ide`
 * and the host adapter, keeping JetBrains/Zed/Cursor ports thin.
 */
import * as vscode from 'vscode';

import type {
	ICommandCallback,
	IConfigurationChangeEvent,
	IDisposable,
	IHostAdapter,
	IHostAlignment,
	IQuickPickItem,
	IStatusBarItem,
	ITreeDataProvider,
	IWebviewOptions,
	IWebviewPanel,
} from '@mcp-vertex/ide/public';

const HOST_VERSION = vscode.version;

class VscodeDisposable implements IDisposable {
	constructor(private readonly inner: vscode.Disposable) {}
	dispose(): void {
		this.inner.dispose();
	}
}

class VscodeStatusBarItem implements IStatusBarItem {
	readonly id: string;
	visible = false;
	private _tooltip: string | undefined;
	private _command: string | undefined;
	constructor(private readonly inner: vscode.StatusBarItem) {
		this.id = `vscode-sb-${inner.alignment}-${inner.priority}`;
		this._tooltip =
			typeof inner.tooltip === 'string' ? inner.tooltip : undefined;
		this._command =
			typeof inner.command === 'string' ? inner.command : undefined;
	}
	get text(): string {
		return this.inner.text;
	}
	set text(value: string) {
		this.inner.text = value;
	}
	get tooltip(): string | undefined {
		return this._tooltip;
	}
	set tooltip(value: string | undefined) {
		this._tooltip = value;
		this.inner.tooltip = value;
	}
	get command(): string | undefined {
		return this._command;
	}
	set command(value: string | undefined) {
		this._command = value;
		if (typeof value === 'string') {
			this.inner.command = value;
		} else {
			this.inner.command = undefined;
		}
	}
	show(): void {
		this.visible = true;
		this.inner.show();
	}
	hide(): void {
		this.visible = false;
		this.inner.hide();
	}
	dispose(): void {
		this.inner.dispose();
	}
}

class VscodeWebviewPanel implements IWebviewPanel {
	readonly id: string;
	visible = true;
	private readonly disposeListeners: Array<() => void> = [];
	private _html = '';
	constructor(
		readonly panel: vscode.WebviewPanel,
		readonly options: IWebviewOptions,
	) {
		this.id = `vscode-webview-${panel.viewType}`;
		this._html = panel.webview.html;
		panel.onDidDispose(() => {
			this.visible = false;
			for (const cb of this.disposeListeners) cb();
		});
	}
	get webview(): {
		html: string;
		readonly options: IWebviewOptions;
		setHtml(html: string): void;
	} {
		return {
			options: this.options,
			html: this._html,
			setHtml: (html: string) => {
				this._html = html;
				this.panel.webview.html = html;
			},
		};
	}
	reveal(viewColumn?: number): void {
		this.panel.reveal(viewColumn);
	}
	dispose(): void {
		this.panel.dispose();
	}
	onDidDispose(cb: () => void): IDisposable {
		this.disposeListeners.push(cb);
		return new VscodeDisposable({ dispose: () => undefined });
	}
}

export const createVscodeHostAdapter = (): IHostAdapter => ({
	id: 'vscode',
	displayName: 'Visual Studio Code',
	hostVersion: HOST_VERSION,

	registerCommand(
		commandId: string,
		callback: ICommandCallback,
	): IDisposable {
		return new VscodeDisposable(
			vscode.commands.registerCommand(commandId, callback),
		);
	},

	createStatusBarItem(
		alignment?: IHostAlignment,
		priority?: number,
	): IStatusBarItem {
		const align =
			alignment === 'right'
				? vscode.StatusBarAlignment.Right
				: vscode.StatusBarAlignment.Left;
		const item = vscode.window.createStatusBarItem(align, priority ?? 0);
		return new VscodeStatusBarItem(item);
	},

	registerTreeDataProvider(
		viewId: string,
		provider: ITreeDataProvider,
	): IDisposable {
		const wrapped: vscode.TreeDataProvider<unknown> = {
			getChildren(element) {
				const id =
					element && typeof element === 'object' && 'id' in element
						? String((element as { id: unknown }).id)
						: undefined;
				const nodes = provider.getChildren(id);
				return nodes.map((n) => ({ ...n, id: n.id }) as unknown);
			},
			getTreeItem(node) {
				const n = node as {
					id: string;
					label: string;
					description?: string;
					tooltip?: string;
					collapsible?: boolean;
					command?: {
						command: string;
						title: string;
						arguments?: readonly unknown[];
					};
				};
				const item = new vscode.TreeItem(n.label);
				item.id = n.id;
				if (n.description !== undefined)
					item.description = n.description;
				if (n.tooltip !== undefined) item.tooltip = n.tooltip;
				item.collapsibleState = n.collapsible
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None;
				if (n.command !== undefined) {
					item.command = {
						command: n.command.command,
						title: n.command.title,
						arguments: n.command.arguments
							? [...n.command.arguments]
							: [],
					};
				}
				return item;
			},
			onDidChangeTreeData: provider.onDidChangeTreeData.bind(
				provider,
			) as never,
		};
		return new VscodeDisposable(
			vscode.window.registerTreeDataProvider(viewId, wrapped),
		);
	},

	createWebviewPanel(
		viewType: string,
		title: string,
		viewColumn: number,
		options: IWebviewOptions,
	): IWebviewPanel {
		const panelOptions: vscode.WebviewPanelOptions = {
			retainContextWhenHidden: options.retainContextWhenHidden ?? true,
		};
		const webviewOptions: vscode.WebviewOptions = {
			enableScripts: options.enableScripts ?? true,
			...(options.localResourceRoots === undefined
				? {}
				: {
						localResourceRoots: options.localResourceRoots.map(
							(p) => vscode.Uri.file(p),
						),
					}),
		};
		const panel = vscode.window.createWebviewPanel(
			viewType,
			title,
			viewColumn,
			{ ...panelOptions, ...webviewOptions },
		);
		return new VscodeWebviewPanel(panel, options);
	},

	async showInformationMessage(message: string) {
		return await vscode.window.showInformationMessage(message);
	},

	async showErrorMessage(message: string) {
		return await vscode.window.showErrorMessage(message);
	},

	async showQuickPick(items: readonly IQuickPickItem[]) {
		const picks: vscode.QuickPickItem[] = items.map((i) => {
			const qp: vscode.QuickPickItem = { label: i.label };
			if (i.description !== undefined) qp.description = i.description;
			if (i.detail !== undefined) qp.detail = i.detail;
			return qp;
		});
		const result = await vscode.window.showQuickPick(picks, {
			placeHolder: 'mcp-vertex',
		});
		if (result === undefined) return undefined;
		const match = items.find((i) => i.label === result.label);
		return match?.id;
	},

	async openTextDocument(uri: string) {
		return await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
	},

	async revealInExplorer(uri: string) {
		await vscode.commands.executeCommand(
			'revealInExplorer',
			vscode.Uri.parse(uri),
		);
	},

	onDidChangeConfiguration(cb: (e: IConfigurationChangeEvent) => void) {
		return new VscodeDisposable(
			vscode.workspace.onDidChangeConfiguration((e) =>
				cb({
					affectsConfiguration: (section: string) =>
						e.affectsConfiguration(section),
				}),
			),
		);
	},

	getConfiguration<T>(section: string) {
		return vscode.workspace.getConfiguration(section) as unknown as T;
	},

	asWebviewUri(relativePath: string) {
		// The host adapter is created per-extension; the extension's
		// `extensionUri` is captured by the consumer that needs it.
		// For dashboard convenience we expose a fallback here that
		// gets overridden when the extension registers its panel
		// with a `localResourceRoots`.
		return `vscode-resource:/extension/${relativePath}`;
	},
});
