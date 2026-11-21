import { describe, expect, it } from 'vitest';

import { createFakeHostFromVscode } from '../host/stub-host-adapter';
import type { IVscodeApi } from '../extension';
import type {
	ITreeDataProvider,
	IWebviewViewProvider,
} from '@delendai/ui-extension/public';

/** Providers the stub accepts and never calls. */
const inertTree: ITreeDataProvider = {
	root: [],
	refresh: () => {},
	onDidChangeTreeData: () => ({ dispose: () => {} }),
	getChildren: () => [],
};
const inertView: IWebviewViewProvider = { resolveWebviewView: () => {} };

const createVscode = (overrides: Partial<IVscodeApi['window']> = {}) => {
	const registered: string[] = [];
	const created: { options: { enableScripts?: boolean }; html: string }[] =
		[];
	const vscode: IVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command) {
				registered.push(command);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel(_type, _title, _column, options) {
				const panel = { webview: { html: '' } };
				created.push({
					options,
					get html() {
						return panel.webview.html;
					},
				});
				return panel;
			},
			...overrides,
		},
	};
	return { vscode, registered, created };
};

describe('stub host adapter', () => {
	it('forwards command registration to the injected host', () => {
		const { vscode, registered } = createVscode();
		createFakeHostFromVscode(vscode).registerCommand('x.y', () => {});
		expect(registered).toEqual(['x.y']);
	});

	it('wraps a panel whose html round-trips through setHtml and defaults scripts on', () => {
		const { vscode, created } = createVscode();
		const panel = createFakeHostFromVscode(vscode).createWebviewPanel(
			'view',
			'Title',
			1,
			{},
		);
		panel.webview.setHtml('<p>hi</p>');
		expect(panel.webview.html).toBe('<p>hi</p>');
		expect(created[0]?.html).toBe('<p>hi</p>');
		expect(created[0]?.options.enableScripts).toBe(true);
		expect(panel.id).toBe('vscode-stub-view');
		expect(panel.visible).toBe(true);
		expect(() => {
			panel.reveal();
			panel.dispose();
			panel.onDidDispose(() => {}).dispose();
		}).not.toThrow();
	});

	it('keeps an explicit enableScripts: false', () => {
		const { vscode, created } = createVscode();
		createFakeHostFromVscode(vscode).createWebviewPanel('v', 't', 1, {
			enableScripts: false,
		});
		expect(created[0]?.options.enableScripts).toBe(false);
	});

	it('delegates messages to the host and tolerates hosts without them', async () => {
		const infos: string[] = [];
		const errors: string[] = [];
		const { vscode } = createVscode({
			async showInformationMessage(m) {
				infos.push(m);
				return 'ok';
			},
			async showErrorMessage(m) {
				errors.push(m);
				return undefined;
			},
		});
		const host = createFakeHostFromVscode(vscode);
		expect(await host.showInformationMessage('i')).toBe('ok');
		await host.showErrorMessage('e');
		expect(infos).toEqual(['i']);
		expect(errors).toEqual(['e']);
		const bare = createFakeHostFromVscode(createVscode().vscode);
		expect(await bare.showInformationMessage('i')).toBeUndefined();
		expect(await bare.showErrorMessage('e')).toBeUndefined();
		expect(await bare.showQuickPick?.([])).toBeUndefined();
		await expect(bare.revealInExplorer('/x')).resolves.toBeUndefined();
	});

	it('refuses the surfaces the stub does not support', async () => {
		const host = createFakeHostFromVscode(createVscode().vscode);
		expect(() => host.createStatusBarItem('left', 1)).toThrow(
			'createStatusBarItem is not supported',
		);
		expect(() => host.registerTreeDataProvider('v', inertTree)).toThrow(
			'registerTreeDataProvider is not supported',
		);
		await expect(host.openTextDocument('/x')).rejects.toThrow(
			'openTextDocument not supported',
		);
	});

	it('answers configuration, change listeners and webview uris with inert values', () => {
		const host = createFakeHostFromVscode(createVscode().vscode);
		expect(host.getConfiguration('delendai')).toEqual({});
		expect(
			host.onDidChangeConfiguration(() => {}).dispose(),
		).toBeUndefined();
		expect(host.asWebviewUri?.('media/a.js')).toBe(
			'vscode-resource:/extension/media/a.js',
		);
	});

	it('registers a view provider and disposes it', () => {
		const host = createFakeHostFromVscode(createVscode().vscode);
		const registration = host.registerWebviewViewProvider?.(
			'delendai.dashboard',
			inertView,
		);
		expect(registration).toBeDefined();
		expect(() => registration?.dispose()).not.toThrow();
	});
});
