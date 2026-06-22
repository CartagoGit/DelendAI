import { describe, expect, it } from 'vitest';

import type {
	IHostAdapter,
	ITreeDataProvider,
} from '../../../src/contracts/interfaces/host-adapter.interface';
import { createFakeHostAdapter } from '../../fake-host-adapter';

describe('IHostAdapter (fake)', () => {
	it('exposes a stable id, displayName and hostVersion', () => {
		const host = createFakeHostAdapter({
			id: 'vscode',
			displayName: 'Visual Studio Code',
			hostVersion: '1.96.0',
		});
		expect(host.id).toBe('vscode');
		expect(host.displayName).toBe('Visual Studio Code');
		expect(host.hostVersion).toBe('1.96.0');
	});

	it('registers commands and tracks call counts via dispatch()', () => {
		const host = createFakeHostAdapter();
		const calls: string[] = [];
		host.registerCommand('mcp-vertex.refresh', () => {
			calls.push('refresh');
			return 'ok';
		});
		expect(host.__spy.commands.get('mcp-vertex.refresh')?.calls).toBe(0);
		const result = host.dispatch('mcp-vertex.refresh');
		expect(result).toBe('ok');
		expect(calls).toEqual(['refresh']);
		expect(host.__spy.commands.get('mcp-vertex.refresh')?.calls).toBe(1);
	});

	it('dispatch returns undefined for unknown command ids', () => {
		const host = createFakeHostAdapter();
		expect(host.dispatch('mcp-vertex.does-not-exist')).toBeUndefined();
	});

	it('createStatusBarItem yields a unique visible item that can be hidden', () => {
		const host = createFakeHostAdapter();
		const item = host.createStatusBarItem('right', 100);
		expect(item.visible).toBe(false);
		item.show();
		expect(item.visible).toBe(true);
		item.hide();
		expect(item.visible).toBe(false);
		expect(host.__spy.statusBarItems).toContain(item);
	});

	it('registerTreeDataProvider stores the provider under the viewId', () => {
		const host = createFakeHostAdapter();
		const provider: ITreeDataProvider = {
			root: [],
			refresh: () => undefined,
			onDidChangeTreeData: () => ({ dispose: () => undefined }),
			getChildren: () => [],
		};
		host.registerTreeDataProvider('mcp-vertex.tools', provider);
		expect(host.__spy.treeProviders.get('mcp-vertex.tools')).toBe(provider);
	});

	it('createWebviewPanel returns a panel whose html can be replaced', () => {
		const host = createFakeHostAdapter();
		const panel = host.createWebviewPanel(
			'mcpVertexDashboard',
			'mcp-vertex Dashboard',
			1,
			{ enableScripts: true, localResourceRoots: ['media/'] },
		);
		panel.webview.setHtml('<h1>hi</h1>');
		expect(panel.webview.html).toBe('<h1>hi</h1>');
		expect(host.__spy.webviewPanels).toHaveLength(1);
	});

	it('openTextDocument records the uri and revealInExplorer prefixes it', async () => {
		const host = createFakeHostAdapter();
		await host.openTextDocument('file:///tmp/foo.md');
		await host.revealInExplorer('file:///tmp/foo.md');
		expect(host.__spy.openedDocuments).toEqual([
			'file:///tmp/foo.md',
			'reveal:file:///tmp/foo.md',
		]);
	});

	it('showInformationMessage and showErrorMessage append to the spy', async () => {
		const host = createFakeHostAdapter();
		await host.showInformationMessage('info');
		await host.showErrorMessage('boom');
		expect(host.__spy.informationMessages).toEqual(['info']);
		expect(host.__spy.errorMessages).toEqual(['boom']);
	});

	it('asWebviewUri prefixes the host scheme', () => {
		const host = createFakeHostAdapter({ id: 'vscode' });
		expect(host.asWebviewUri('media/logo.svg')).toBe(
			'webview://fake/media/logo.svg',
		);
	});

	it('getConfiguration records the section read', () => {
		const host = createFakeHostAdapter();
		host.getConfiguration('mcp-vertex');
		expect(host.__spy.configurationReads).toEqual(['mcp-vertex']);
	});

	it('FakeHostAdapter satisfies IHostAdapter at compile time', () => {
		// Compile-time check: this assignment would fail if the fake
		// drifted from the interface.
		const host: IHostAdapter = createFakeHostAdapter();
		void host;
		expect(true).toBe(true);
	});
});
