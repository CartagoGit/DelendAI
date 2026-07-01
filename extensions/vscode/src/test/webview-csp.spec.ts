/**
 * webview-csp.spec.ts — f00079 S1 (closes a00040 H2).
 *
 * Pins that the rendered webview HTML carries a Content-Security-Policy
 * meta tag at the command boundary:
 *   - JSON webviews (via `renderJsonHtml`) get the default-deny policy
 *     (`script-src 'none'`).
 *   - the toolbar webview carries its `script-src 'unsafe-inline'`
 *     override so its inline `<script>` keeps working while frames and
 *     connections stay denied.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import { renderJsonHtml } from '../commands/types';
import { registerOpenToolbarCommand } from '../commands/open-toolbar';
import type { ICommandDeps } from '../commands/types';

describe('JSON webview CSP (f00079 S1)', () => {
	it('renderJsonHtml injects a default-deny CSP', () => {
		const html = renderJsonHtml('Title', { a: 1 });
		expect(html).toContain('http-equiv="Content-Security-Policy"');
		expect(html).toContain("script-src 'none'");
		expect(html).toContain("frame-src 'none'");
	});
});

describe('toolbar webview CSP (f00079 S1)', () => {
	it('carries the unsafe-inline script override but denies frames', async () => {
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		let html = '';
		const vscode = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand(
					command: string,
					cb: (...args: readonly unknown[]) => unknown,
				) {
					commands.set(command, cb);
					return { dispose() {} };
				},
				async executeCommand() {
					return undefined;
				},
			},
			window: {
				createWebviewPanel() {
					return {
						webview: {
							set html(value: string) {
								html = value;
							},
							get html() {
								return html;
							},
							onDidReceiveMessage() {
								return { dispose() {} };
							},
						},
					};
				},
				async showErrorMessage() {
					return undefined;
				},
			},
		} as unknown as ICommandDeps['vscode'];

		const deps: ICommandDeps = {
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
		};

		registerOpenToolbarCommand(deps);
		await commands.get('mcp-vertex.openToolbar')?.();

		expect(html).toContain('http-equiv="Content-Security-Policy"');
		expect(html).toContain("script-src 'unsafe-inline'");
		expect(html).toContain("frame-src 'none'");
	});
});
