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
	IWebviewViewProvider,
} from '../src/contracts/interfaces/host-adapter.interface';

class TrackingDisposable implements IDisposable {
	disposed = false;
	constructor(private readonly onDispose?: () => void) {}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.onDispose?.();
	}
}

class FakeStatusBarItem implements IStatusBarItem {
	readonly id: string;
	text = '';
	tooltip: string | undefined;
	command: string | undefined;
	visible = false;
	constructor(id: string) {
		this.id = id;
	}
	show(): void {
		this.visible = true;
	}
	hide(): void {
		this.visible = false;
	}
	dispose(): void {
		this.visible = false;
	}
}

class FakeWebviewPanel implements IWebviewPanel {
	readonly id: string;
	readonly options: IWebviewOptions;
	readonly webview: {
		html: string;
		readonly options: IWebviewOptions;
		setHtml(html: string): void;
	};
	visible = true;
	private readonly disposeListeners: Array<() => void> = [];
	constructor(id: string, options: IWebviewOptions) {
		this.id = id;
		this.options = { ...options };
		const webview: {
			html: string;
			readonly options: IWebviewOptions;
			setHtml(html: string): void;
		} = {
			options: this.options,
			html: '',
			setHtml: () => undefined,
		};
		webview.setHtml = (html: string): void => {
			(webview as { html: string }).html = html;
		};
		this.webview = webview;
	}
	reveal(_viewColumn?: number): void {
		this.visible = true;
	}
	dispose(): void {
		this.visible = false;
		for (const cb of this.disposeListeners) cb();
	}
	onDidDispose(cb: () => void): IDisposable {
		this.disposeListeners.push(cb);
		return new TrackingDisposable();
	}
}

interface IRegisteredCommand {
	id: string;
	cb: ICommandCallback;
	calls: number;
	lastArgs: readonly unknown[] | undefined;
}

export interface IFakeHostAdapter extends IHostAdapter {
	readonly __spy: {
		readonly commands: Map<string, IRegisteredCommand>;
		readonly statusBarItems: FakeStatusBarItem[];
		readonly webviewPanels: FakeWebviewPanel[];
		readonly treeProviders: Map<string, ITreeDataProvider>;
		readonly openedDocuments: string[];
		readonly informationMessages: string[];
		readonly errorMessages: string[];
		readonly configurationReads: string[];
	};
	/** Dispatch a registered command by id; returns its result or `undefined`. */
	dispatch(id: string, ...args: readonly unknown[]): unknown | undefined;
}

export interface FakeHostAdapterOptions {
	readonly id?: string;
	readonly displayName?: string;
	readonly hostVersion?: string;
}

export const createFakeHostAdapter = (
	options: FakeHostAdapterOptions = {},
): IFakeHostAdapter => {
	const commands = new Map<string, IRegisteredCommand>();
	const statusBarItems: FakeStatusBarItem[] = [];
	const webviewPanels: FakeWebviewPanel[] = [];
	const treeProviders = new Map<string, ITreeDataProvider>();
	const openedDocuments: string[] = [];
	const informationMessages: string[] = [];
	const errorMessages: string[] = [];
	const configurationReads: string[] = [];

	let nextId = 0;
	const idOf = (prefix: string): string => `${prefix}-${++nextId}`;

	const adapter: IHostAdapter = {
		id: options.id ?? 'fake',
		displayName: options.displayName ?? 'Fake Host',
		hostVersion: options.hostVersion ?? '0.0.0-test',

		registerCommand(commandId: string, callback: ICommandCallback) {
			commands.set(commandId, {
				id: commandId,
				cb: callback,
				calls: 0,
				lastArgs: undefined,
			});
			return new TrackingDisposable(() => {
				commands.delete(commandId);
			});
		},

		createStatusBarItem(alignment?: IHostAlignment, priority?: number) {
			const item = new FakeStatusBarItem(
				idOf(`sb-${alignment ?? 'left'}-${priority ?? 0}`),
			);
			statusBarItems.push(item);
			return item;
		},

		registerTreeDataProvider(viewId: string, provider: ITreeDataProvider) {
			treeProviders.set(viewId, provider);
			return new TrackingDisposable(() => {
				treeProviders.delete(viewId);
			});
		},

		createWebviewPanel(
			_viewType: string,
			_title: string,
			_viewColumn: number,
			options: IWebviewOptions,
		) {
			const panel = new FakeWebviewPanel(idOf('webview'), options);
			webviewPanels.push(panel);
			return panel;
		},

		registerWebviewViewProvider(
			_viewId: string,
			_provider: IWebviewViewProvider,
		): IDisposable {
			return new TrackingDisposable();
		},

		async showInformationMessage(message: string) {
			informationMessages.push(message);
			return undefined;
		},

		async showErrorMessage(message: string) {
			errorMessages.push(message);
			return undefined;
		},

		async showQuickPick(items: readonly IQuickPickItem[]) {
			const first = items[0];
			return first?.id;
		},

		async openTextDocument(uri: string) {
			openedDocuments.push(uri);
			return { uri };
		},

		async revealInExplorer(uri: string) {
			openedDocuments.push(`reveal:${uri}`);
		},

		onDidChangeConfiguration(cb: (e: IConfigurationChangeEvent) => void) {
			void cb;
			return new TrackingDisposable();
		},

		getConfiguration<T>(section: string) {
			configurationReads.push(section);
			return {} as T;
		},

		asWebviewUri(relativePath: string) {
			return `webview://fake/${relativePath}`;
		},
	};

	const fake = adapter as IFakeHostAdapter;
	(fake as unknown as { __spy: IFakeHostAdapter['__spy'] }).__spy = {
		commands,
		statusBarItems,
		webviewPanels,
		treeProviders,
		openedDocuments,
		informationMessages,
		errorMessages,
		configurationReads,
	};
	fake.dispatch = (id: string, ...args: readonly unknown[]): unknown => {
		const entry = commands.get(id);
		if (entry === undefined) return undefined;
		entry.calls += 1;
		entry.lastArgs = args;
		return entry.cb(...args);
	};
	return fake;
};

export type { IConfigurationChangeEvent };
