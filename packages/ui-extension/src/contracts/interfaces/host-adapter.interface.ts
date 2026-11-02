/**
 * `IHostAdapter` — the single seam between the IDE-agnostic UI shell
 * (`apps/ide/`) and any specific IDE host (VS Code today; JetBrains,
 * Zed, Cursor, Antigravity tomorrow).
 *
 * Every method is synchronous-or-Promise-based and **never throws on
 * missing host capabilities** — instead it returns a typed empty value
 * (`undefined`, `[]`, `''`) so the dashboard can degrade gracefully.
 * Hosts that genuinely cannot fulfil a method must still implement it
 * and document the limitation in their adapter's README; the dashboard
 * never branches on host identity.
 *
 * The interface is intentionally narrow. Anything that would force a
 * host import (e.g. `vscode.TreeDataProvider`, `com.intellij.*`)
 * belongs in the per-host adapter, not here.
 */

export interface IDisposable {
	dispose(): void;
}

export type IHostAlignment = 'left' | 'right';

export interface IStatusBarItem {
	readonly id: string;
	readonly visible: boolean;
	text: string;
	tooltip: string | undefined;
	command: string | undefined;
	show(): void;
	hide(): void;
	dispose(): void;
}

export interface IWebviewOptions {
	readonly enableScripts?: boolean;
	readonly localResourceRoots?: readonly string[];
	readonly retainContextWhenHidden?: boolean;
}

export interface IWebviewPanel {
	readonly id: string;
	readonly webview: {
		html: string;
		readonly options: IWebviewOptions;
		setHtml(html: string): void;
		/**
		 * Receive every `postMessage` from this webview. Returns a
		 * disposable that, when invoked, removes the listener. Optional
		 * because host simulators (test fakes) often don't model the
		 * full message bus.
		 */
		readonly onDidReceiveMessage?: (
			cb: (msg: unknown) => void | Promise<void>,
		) => IDisposable;
		/** Send a message FROM the host TO the webview. */
		readonly postMessage?: (msg: unknown) => Promise<void>;
	};
	readonly visible: boolean;
	reveal(viewColumn?: number): void;
	dispose(): void;
	onDidDispose(cb: () => void): IDisposable;
}

export interface ITreeNode {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly icon?: string;
	readonly collapsible?: boolean;
	readonly children?: readonly ITreeNode[];
	readonly command?: {
		readonly command: string;
		readonly title: string;
		readonly arguments?: readonly unknown[];
	};
}

export interface ITreeDataProvider {
	readonly root: readonly ITreeNode[];
	refresh(): void;
	onDidChangeTreeData(cb: () => void): IDisposable;
	getChildren(nodeId?: string): readonly ITreeNode[];
}

export interface IConfigurationChangeEvent {
	affectsConfiguration(section: string): boolean;
}

export interface IWebviewViewProvider {
	resolveWebviewView(webview: IWebviewPanel): void | Promise<void>;
}

export type ICommandCallback = (...args: readonly unknown[]) => unknown;

export interface IQuickPickItem {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly detail?: string;
}

export interface IHostAdapter {
	/** Stable identifier for the host (e.g. `vscode`, `jetbrains`, `zed`). */
	readonly id: string;
	/** Human-readable name for the host (e.g. `Visual Studio Code`). */
	readonly displayName: string;
	/** Absolute version string of the host runtime. */
	readonly hostVersion: string;

	// ---- commands & status ----------------------------------------------------

	registerCommand(commandId: string, callback: ICommandCallback): IDisposable;

	/**
	 * Dispatch a command by id (with optional arguments). Used by
	 * webview message bridges that need to fire-and-forget a
	 * registered command without owning the registration lifecycle.
	 * Optional because some hosts don't expose command dispatch
	 * outside their own process.
	 */
	executeCommand?(
		commandId: string,
		...args: readonly unknown[]
	): Promise<unknown>;

	createStatusBarItem(
		alignment?: IHostAlignment,
		priority?: number,
	): IStatusBarItem;

	// ---- trees ----------------------------------------------------------------

	registerTreeDataProvider(
		viewId: string,
		provider: ITreeDataProvider,
	): IDisposable;

	// ---- webviews -------------------------------------------------------------

	createWebviewPanel(
		viewType: string,
		title: string,
		viewColumn: number,
		options: IWebviewOptions,
	): IWebviewPanel;

	/** Optional: hosts that support sidebar webviews (VS Code's webviewView). */
	registerWebviewViewProvider?(
		viewId: string,
		provider: IWebviewViewProvider,
	): IDisposable;

	// ---- notifications & dialogs ---------------------------------------------

	showInformationMessage(message: string): Promise<string | undefined>;
	showErrorMessage(message: string): Promise<string | undefined>;
	showQuickPick?(
		items: readonly IQuickPickItem[],
	): Promise<string | undefined>;

	// ---- documents & files ----------------------------------------------------

	openTextDocument(uri: string): Promise<unknown>;
	revealInExplorer(uri: string): Promise<void>;

	// ---- configuration --------------------------------------------------------

	onDidChangeConfiguration(
		cb: (e: IConfigurationChangeEvent) => void,
	): IDisposable;

	getConfiguration<T>(section: string): T;

	// ---- assets ---------------------------------------------------------------

	/**
	 * URI for an asset inside the host bundle (e.g. `media/logo.svg`).
	 * Hosts that resolve URIs through a live webview (VS Code 1.56+)
	 * should pass the panel so the result honours `localResourceRoots`.
	 * Hosts without a panel handle return a relative URI and let the
	 * CSP surface the failure.
	 */
	asWebviewUri(relativePath: string, panel?: IWebviewPanel): string;
}
