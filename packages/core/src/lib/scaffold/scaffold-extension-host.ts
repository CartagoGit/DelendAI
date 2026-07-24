import type { IScaffoldedFile } from './scaffold-host';
import type { IScaffoldExtensionHostOptions } from '../contracts/interfaces/scaffold-extension-host-options.interface';

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const pascal = (value: string): string =>
	kebab(value)
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');

/**
 * Generate a TypeScript reference IDE host. The scaffold is intentionally
 * transport-light: one command calls overview and renders escaped JSON,
 * while the adapter exposes the required `IHostAdapter` members as
 * host-porting seams.
 */
export const scaffoldExtensionHostFiles = (
	options: IScaffoldExtensionHostOptions,
): readonly IScaffoldedFile[] => {
	const id = kebab(options.hostName);
	const fn = pascal(id);
	const scope = options.scope ?? '@cartago-git';
	const pkg = `${scope}/mcp-extension-host-${id}`;
	const safeDescription = options.description.replace(/'/g, '');
	return [
		{
			path: `extension-hosts/${id}/package.json`,
			content: `${JSON.stringify(
				{
					name: pkg,
					version: '0.1.0',
					type: 'module',
					description: safeDescription,
					license: 'MIT',
					main: './src/index.ts',
					exports: { '.': './src/index.ts' },
					scripts: {
						test: 'vitest run',
						typecheck: 'tsc --noEmit -p tsconfig.json',
					},
					dependencies: {
						'@mcp-vertex/client': '^0.1.0',
						'@mcp-vertex/ui-extension': '^0.1.0',
					},
					devDependencies: {
						'@types/node': '^26.1.0',
						typescript: '^7.0.0',
						vitest: '^4.1.10',
					},
				},
				null,
				'\t',
			)}\n`,
		},
		{
			path: `extension-hosts/${id}/tsconfig.json`,
			content: `${JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'NodeNext',
						moduleResolution: 'NodeNext',
						strict: true,
						skipLibCheck: true,
						types: ['node', 'vitest'],
					},
					include: ['src/**/*', 'tests/**/*'],
				},
				null,
				'\t',
			)}\n`,
		},
		{
			path: `extension-hosts/${id}/src/render-json-html.ts`,
			content: `const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

export const renderJsonHtml = (title: string, payload: unknown): string => {
	const json = JSON.stringify(payload, null, '\\t') ?? 'null';
	return \`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>\${escapeHtml(title)}</title>
	<style>
		body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; }
		pre { white-space: pre-wrap; overflow-wrap: anywhere; }
	</style>
</head>
<body>
	<h1>\${escapeHtml(title)}</h1>
	<pre>\${escapeHtml(json)}</pre>
</body>
</html>\`;
};
`,
		},
		{
			path: `extension-hosts/${id}/src/host-adapter.ts`,
			content: `import type {
	ICommandCallback,
	IConfigurationChangeEvent,
	IDisposable,
	IHostAdapter,
	IHostAlignment,
	IStatusBarItem,
	ITreeDataProvider,
	IWebviewOptions,
	IWebviewPanel,
} from '@mcp-vertex/ui-extension/public';

	export interface I${fn}HostAdapterOptions {
	readonly version?: string;
	readonly commands?: Map<string, ICommandCallback>;
}

const disposable = (dispose: () => void = () => {}): IDisposable => ({
	dispose,
});

const createInertStatusBarItem = (): IStatusBarItem => ({
	id: '${id}.status',
	visible: false,
	text: '',
	tooltip: undefined,
	command: undefined,
	show() {},
	hide() {},
	dispose() {},
});

const createInertWebviewPanel = (
	viewType: string,
	options: IWebviewOptions,
): IWebviewPanel => {
	let html = '';
	let disposed = false;
	return {
		id: viewType,
		visible: !disposed,
		webview: {
			get html() {
				return html;
			},
			set html(next: string) {
				html = next;
			},
			options,
			setHtml(next: string) {
				html = next;
			},
		},
		reveal() {},
		dispose() {
			disposed = true;
		},
		onDidDispose() {
			return disposable();
		},
	};
};

export const create${fn}HostAdapter = (
	options: I${fn}HostAdapterOptions = {},
): IHostAdapter => {
	const commands = options.commands ?? new Map<string, ICommandCallback>();
	return {
		id: '${id}',
		displayName: '${fn}',
		hostVersion: options.version ?? '0.0.0',
		registerCommand(commandId, callback) {
			commands.set(commandId, callback);
			return disposable(() => {
				commands.delete(commandId);
			});
		},
		createStatusBarItem(_alignment?: IHostAlignment, _priority?: number) {
			return createInertStatusBarItem();
		},
		registerTreeDataProvider(_viewId: string, _provider: ITreeDataProvider) {
			return disposable();
		},
		createWebviewPanel(
			viewType: string,
			_title: string,
			_viewColumn: number,
			webviewOptions: IWebviewOptions,
		) {
			return createInertWebviewPanel(viewType, webviewOptions);
		},
		async showInformationMessage() {
			return undefined;
		},
		async showErrorMessage() {
			return undefined;
		},
		async openTextDocument(uri: string) {
			return { uri };
		},
		async revealInExplorer() {},
		onDidChangeConfiguration(
			_cb: (event: IConfigurationChangeEvent) => void,
		) {
			return disposable();
		},
		getConfiguration<T>(_section: string): T {
			return {} as T;
		},
		asWebviewUri(relativePath: string) {
			return relativePath;
		},
	};
};
`,
		},
		{
			path: `extension-hosts/${id}/src/commands/open-overview.ts`,
			content: `import {
	McpStdioClient,
	OverviewService,
} from '@mcp-vertex/client';
import type { IHostAdapter } from '@mcp-vertex/ui-extension/public';

import { renderJsonHtml } from '../render-json-html';

	export interface IOpenOverviewOptions {
	readonly client?: McpStdioClient;
	readonly command?: string;
	readonly args?: readonly string[];
	readonly namespacePrefix?: string;
}

export const openOverview = async (
	host: IHostAdapter,
	options: IOpenOverviewOptions = {},
): Promise<void> => {
	const ownsClient = options.client === undefined;
	const client =
		options.client ??
		(await McpStdioClient.connect({
			command: options.command ?? 'bunx',
			args: [...(options.args ?? ['@mcp-vertex/core'])],
		}));
	try {
		const overview = await new OverviewService(
			client,
			options.namespacePrefix,
		).getOverview({ compact: true });
		const panel = host.createWebviewPanel(
			'mcpVertexOverview',
			'mcp-vertex Overview',
			1,
			{ enableScripts: false },
		);
		panel.webview.setHtml(renderJsonHtml('mcp-vertex Overview', overview));
		panel.reveal();
	} finally {
		if (ownsClient) await client.close();
	}
};
`,
		},
		{
			path: `extension-hosts/${id}/src/index.ts`,
			content: `export { openOverview } from './commands/open-overview';
export type { IOpenOverviewOptions } from './commands/open-overview';
export { create${fn}HostAdapter } from './host-adapter';
export type { I${fn}HostAdapterOptions } from './host-adapter';
export { renderJsonHtml } from './render-json-html';
`,
		},
		{
			path: `extension-hosts/${id}/tests/open-overview.spec.ts`,
			content: `import { McpStdioClient } from '@mcp-vertex/client';
import { describe, expect, it } from 'vitest';

import { openOverview } from '../src/commands/open-overview';
import { create${fn}HostAdapter } from '../src/host-adapter';

describe('openOverview', () => {
	it('renders overview JSON into a host webview', async () => {
		const host = create${fn}HostAdapter();
		const panels: string[] = [];
		const originalCreate = host.createWebviewPanel.bind(host);
		host.createWebviewPanel = (...args) => {
			const panel = originalCreate(...args);
			const originalSetHtml = panel.webview.setHtml.bind(panel.webview);
			panel.webview.setHtml = (html) => {
				panels.push(html);
				originalSetHtml(html);
			};
			return panel;
		};
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				expect(input.name).toBe('mcp-vertex_overview');
				return {
					structuredContent: {
						namespacePrefix: 'mcp-vertex',
						server: { name: 'mcp-vertex', version: '0.1.0' },
						plugins: [],
						tools: {},
						knowledge: [],
						recommendedNextAction: 'Orient.',
					},
				};
			},
		});

		await openOverview(host, { client });

		expect(panels[0]).toContain('mcp-vertex Overview');
		expect(panels[0]).toContain('recommendedNextAction');
	});
});
`,
		},
		{
			path: `extension-hosts/${id}/README.md`,
			content: `# ${pkg}

${safeDescription}

This is a reference TypeScript host scaffold for mcp-vertex. Implement the
adapter seams in \`src/host-adapter.ts\`, then wire host-native menus,
views, and lifecycle hooks around \`openOverview\`.

Run:

\`\`\`sh
bun install
bun run typecheck
bun run test
\`\`\`
`,
		},
	];
};
