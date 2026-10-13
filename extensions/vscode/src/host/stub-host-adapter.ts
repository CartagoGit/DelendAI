import type {
	IHostAdapter,
	IWebviewViewProvider,
} from '@delendai/ui-extension/public';

import type { IVscodeApi } from '../extension';

/**
 * `createFakeHostFromVscode` — minimal adapter that lets the dashboard
 * command work even when the host is an injected `IVscodeApi` (test
 * seams, alt IDE ports) instead of the real VS Code module. Only the
 * surface the dashboard actually needs (`registerCommand`,
 * `createWebviewPanel`) is wired; everything else throws so a misuse
 * surfaces immediately during development.
 */
const registeredFakeViewProviders = new WeakMap<
	object,
	{ readonly viewId: string; readonly provider: IWebviewViewProvider }
>();

export const createFakeHostFromVscode = (vscode: IVscodeApi): IHostAdapter => ({
	id: 'vscode-stub',
	displayName: 'VS Code (test stub)',
	hostVersion: '0.0.0',
	registerCommand(command, callback) {
		return vscode.commands.registerCommand(command, callback);
	},
	createStatusBarItem() {
		throw new Error(
			'createStatusBarItem is not supported on the test-stub host',
		);
	},
	registerTreeDataProvider() {
		throw new Error(
			'registerTreeDataProvider is not supported on the test-stub host',
		);
	},
	createWebviewPanel(viewType, title, viewColumn, options) {
		const panel = vscode.window.createWebviewPanel(
			viewType,
			title,
			viewColumn,
			{ enableScripts: options.enableScripts ?? true },
		);
		// The dashboard only uses setHtml; the real adapter exposes a
		// richer webview wrapper we don't need here.
		return {
			id: `vscode-stub-${viewType}`,
			visible: true,
			webview: {
				options,
				get html() {
					return panel.webview.html;
				},
				setHtml(html) {
					panel.webview.html = html;
				},
			},
			reveal() {
				/* no-op in stub */
			},
			dispose() {
				/* no-op in stub */
			},
			onDidDispose() {
				return { dispose() {} };
			},
		};
	},
	async showInformationMessage(message) {
		return vscode.window.showInformationMessage?.(message);
	},
	async showErrorMessage(message) {
		return vscode.window.showErrorMessage?.(message);
	},
	async showQuickPick() {
		return undefined;
	},
	async openTextDocument() {
		throw new Error('openTextDocument not supported on the test-stub host');
	},
	async revealInExplorer() {
		/* no-op in stub */
	},
	onDidChangeConfiguration() {
		return { dispose() {} };
	},
	getConfiguration<T>(section: string) {
		// Stripped hosts that inject `IVscodeApi` rarely expose
		// `workspace.getConfiguration`. Return an empty object — the
		// dashboard uses the EmbedService's fallback URL when this is
		// empty, which is the right behaviour for a stub.
		void section;
		return {} as T;
	},
	registerWebviewViewProvider(viewId, provider) {
		registeredFakeViewProviders.set(vscode, { viewId, provider });
		return {
			dispose() {
				const registered = registeredFakeViewProviders.get(vscode);
				if (registered?.viewId === viewId) {
					registeredFakeViewProviders.delete(vscode);
				}
			},
		};
	},
	asWebviewUri(relativePath) {
		return `vscode-resource:/extension/${relativePath}`;
	},
});
