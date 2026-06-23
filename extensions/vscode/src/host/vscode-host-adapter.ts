/**
 * `VscodeHostAdapter` — concrete `IHostAdapter` implementation that
 * binds the host-agnostic UI shell (`@mcp-vertex/ui-extension`) to
 * the real `vscode` module. **This is the only file in
 * `extensions/vscode/` that imports `vscode`**; every other module
 * imports `@mcp-vertex/ui-extension` and the host adapter, keeping
 * JetBrains/Zed/Cursor ports thin.
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
} from '@mcp-vertex/ui-extension/public';

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
	private readonly disposeListeners: Set<() => void> = new Set();
	private readonly messageListeners: Set<
		(msg: unknown) => void | Promise<void>
	> = new Set();
	private _html = '';
	private panelDisposeSub: vscode.Disposable | undefined;
	constructor(
		readonly panel: vscode.WebviewPanel,
		readonly options: IWebviewOptions,
	) {
		this.id = `vscode-webview-${panel.viewType}`;
		this._html = panel.webview.html;
		// FIX (A1): the previous implementation pushed into an Array and
		// returned a fake disposable whose `dispose()` did nothing, so a
		// consumer calling dispose kept a stale callback in the array.
		// Now we use a Set, and the disposable removes the entry.
		this.panelDisposeSub = panel.onDidDispose(() => {
			this.visible = false;
			for (const cb of Array.from(this.disposeListeners)) {
				try {
					cb();
				} catch (e) {
					console.error(
						'[mcp-vertex] onDidDispose callback threw:',
						e,
					);
				}
			}
			this.disposeListeners.clear();
			this.messageListeners.clear();
		});
	}
	get webview(): {
		html: string;
		readonly options: IWebviewOptions;
		setHtml(html: string): void;
		readonly onDidReceiveMessage?: (
			cb: (msg: unknown) => void | Promise<void>,
		) => IDisposable;
		readonly postMessage?: (msg: unknown) => Promise<void>;
	} {
		return {
			options: this.options,
			html: this._html,
			setHtml: (html: string) => {
				this._html = html;
				this.panel.webview.html = html;
			},
			onDidReceiveMessage: (cb) => {
				this.messageListeners.add(cb);
				const sub = this.panel.webview.onDidReceiveMessage((msg) => {
					void Promise.resolve(cb(msg)).catch((e: unknown) => {
						console.error(
							'[mcp-vertex] onDidReceiveMessage handler threw:',
							e,
						);
					});
				});
				return new VscodeDisposable({
					dispose: () => {
						this.messageListeners.delete(cb);
						sub.dispose();
					},
				});
			},
			postMessage: async (msg) => {
				// VS Code's `postMessage` returns `Thenable<boolean>`. The
				// `IWebviewPanel` contract pins it to `Promise<void>` so
				// host fakes that don't model a real message bus can stay
				// trivially `{ postMessage: async () => {} }`. We await and
				// swallow the boolean here.
				await this.panel.webview.postMessage(msg);
			},
			onDidDispose: (cb) => {
				this.disposeListeners.add(cb);
				return new VscodeDisposable({
					dispose: () => {
						this.disposeListeners.delete(cb);
					},
				});
			},
		};
	}
	reveal(viewColumn?: number): void {
		this.panel.reveal(viewColumn);
	}
	dispose(): void {
		this.panelDisposeSub?.dispose();
		this.panel.dispose();
	}
	onDidDispose(cb: () => void): IDisposable {
		this.disposeListeners.add(cb);
		return new VscodeDisposable({
			dispose: () => {
				this.disposeListeners.delete(cb);
			},
		});
	}
}

export interface ICreateVscodeHostAdapterOptions {
	/** The extension's `ExtensionContext.extensionUri`. Required for
	 * `asWebviewUri(...)` to produce valid URIs — without it the
	 * function used to return a deprecated `vscode-resource:` URI
	 * that the modern webview rejects silently. */
	readonly extensionUri?: vscode.Uri;
}

export const createVscodeHostAdapter = (
	options: ICreateVscodeHostAdapterOptions = {},
): IHostAdapter => {
	const extensionUri = options.extensionUri;
	return {
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

		async executeCommand(
			commandId: string,
			...args: readonly unknown[]
		): Promise<unknown> {
			return vscode.commands.executeCommand(commandId, ...args);
		},

		createStatusBarItem(
			alignment?: IHostAlignment,
			priority?: number,
		): IStatusBarItem {
			const align =
				alignment === 'right'
					? vscode.StatusBarAlignment.Right
					: vscode.StatusBarAlignment.Left;
			const item = vscode.window.createStatusBarItem(
				align,
				priority ?? 0,
			);
			return new VscodeStatusBarItem(item);
		},

		registerTreeDataProvider(
			viewId: string,
			provider: ITreeDataProvider,
		): IDisposable {
			const wrapped: vscode.TreeDataProvider<unknown> = {
				getChildren(element) {
					const id =
						element &&
						typeof element === 'object' &&
						'id' in element
							? String((element as { id: unknown }).id)
							: undefined;
					const raw = provider.getChildren(id);
					// Defensive: a provider may return `undefined` (typing
					// currently pins it to `T[]`, but the contract has
					// historically allowed it). VS Code's tree renderer
					// explodes on `undefined`, so we collapse to an empty
					// array instead of taking the whole extension down.
					const nodes = Array.isArray(raw) ? raw : [];
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
				retainContextWhenHidden:
					options.retainContextWhenHidden ?? true,
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
				// FIX (A2): the previous implementation matched the user
				// pick back to the original item by `label`, which silently
				// resolved to the FIRST item with a duplicate label. We
				// now embed the id in `description` so the pick is unique
				// even when two entries share a label (common in the
				// mixed tools+knowledge QuickPick).
				const qp: vscode.QuickPickItem = {
					label: i.label,
					description: i.id,
				};
				if (i.detail !== undefined) qp.detail = i.detail;
				return qp;
			});
			const result = await vscode.window.showQuickPick(picks, {
				placeHolder: 'mcp-vertex',
			});
			if (result === undefined) return undefined;
			// Match by id (now in `description`); fall back to label so
			// hosts that override this method without passing id still work.
			const idDesc = result.description ?? '';
			return items.find((i) => i.id === idDesc)?.id ?? result.label;
		},

		async openTextDocument(uri: string) {
			return await vscode.workspace.openTextDocument(
				vscode.Uri.parse(uri),
			);
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

		asWebviewUri(relativePath: string, panel?: IWebviewPanel): string {
			// FIX (A3): the previous implementation returned a hardcoded
			// `vscode-resource:/extension/...` URI. That scheme was
			// deprecated in VS Code 1.56 (2021) and silently rejected by
			// modern webviews — every CSS/asset linked this way 404'd.
			// The canonical way to resolve a resource inside a webview is
			// `panel.webview.asWebviewUri(absoluteUri)`, which honours
			// `localResourceRoots` and returns a scheme the modern webview
			// understands. Callers that don't have a panel handle must
			// pass one or accept a relative URI as a fallback (which the
			// CSP will block but at least surfaces the failure visibly).
			if (panel === undefined) {
				return relativePath;
			}
			const inner = (
				panel as unknown as {
					panel?: {
						webview: { asWebviewUri(uri: vscode.Uri): vscode.Uri };
					};
				}
			).panel;
			if (extensionUri !== undefined && inner !== undefined) {
				const absolute = vscode.Uri.joinPath(
					extensionUri,
					relativePath,
				);
				return inner.webview.asWebviewUri(absolute).toString();
			}
			return relativePath;
		},
	};
};
