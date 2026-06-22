/**
 * f00045 S3: `showCommandError` renders an "Open log" toast action when
 * the failure carries a `logHint`, and dispatches `vscode.open` at the
 * exact JSONL line on click. When there is no hint (or the host lacks
 * the `Uri`/`executeCommand` surface) it falls back to the plain error
 * toast — the absence of the link is itself the affordance.
 */
import { describe, expect, it } from 'vitest';

import {
	showCommandError,
	type ICommandVscodeApi,
	type IVscodeUri,
} from '../commands/types';

interface OpenCall {
	readonly command: string;
	readonly path: string;
	readonly fragment: string | undefined;
}

interface IFakeUri extends IVscodeUri {
	readonly path: string;
	readonly fragment: string | undefined;
	with(change: { readonly fragment?: string }): IFakeUri;
}

const makeUri = (path: string, fragment: string | undefined): IFakeUri => ({
	path,
	fragment,
	with(change) {
		return makeUri(path, change.fragment);
	},
});

const createVscode = (clickAction: string | undefined) => {
	const errorCalls: Array<{ message: string; actions: string[] }> = [];
	const opened: OpenCall[] = [];

	const vscode: ICommandVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand() {
				return { dispose() {} };
			},
			async executeCommand(command, ...args) {
				const uri = args[0] as IFakeUri;
				opened.push({
					command,
					path: uri.path,
					fragment: uri.fragment,
				});
				return undefined;
			},
		},
		Uri: {
			file(path: string): IFakeUri {
				return makeUri(path, undefined);
			},
		},
		window: {
			createWebviewPanel() {
				return { webview: { html: '' } };
			},
			async showErrorMessage(message, ...actions) {
				errorCalls.push({ message, actions: [...actions] });
				return clickAction;
			},
		},
	};
	return { vscode, errorCalls, opened };
};

const errorWithHint = (line: number) =>
	Object.assign(new Error('boom'), {
		logHint: {
			path: '/tmp/ws/.cache/mcp-vertex/logs/2026-06-22.jsonl',
			line,
			ts: '2026-06-22T10:00:00.000Z',
		},
	});

describe('showCommandError — log-link affordance (f00045 S3)', () => {
	it('offers an "Open log" action and opens the log at #L<line> on click', async () => {
		const { vscode, errorCalls, opened } = createVscode('Open log');

		await showCommandError(vscode, 'show overview', errorWithHint(42));

		expect(errorCalls).toHaveLength(1);
		expect(errorCalls[0]?.actions).toEqual(['Open log']);
		expect(opened).toEqual([
			{
				command: 'vscode.open',
				path: '/tmp/ws/.cache/mcp-vertex/logs/2026-06-22.jsonl',
				fragment: 'L42',
			},
		]);
	});

	it('does not open anything when the user dismisses the toast', async () => {
		const { vscode, opened } = createVscode(undefined);
		await showCommandError(vscode, 'show metrics', errorWithHint(7));
		expect(opened).toEqual([]);
	});

	it('falls back to a plain error toast when the error has no logHint', async () => {
		const { vscode, errorCalls, opened } = createVscode('Open log');
		await showCommandError(vscode, 'run validation', new Error('nope'));
		expect(errorCalls).toHaveLength(1);
		// No action button offered.
		expect(errorCalls[0]?.actions).toEqual([]);
		expect(opened).toEqual([]);
	});

	it('falls back to a plain toast when the host lacks the Uri surface', async () => {
		const { vscode, errorCalls, opened } = createVscode('Open log');
		const { Uri: _omitted, ...withoutUri } = vscode;
		await showCommandError(withoutUri, 'tool search', errorWithHint(3));
		expect(errorCalls[0]?.actions).toEqual([]);
		expect(opened).toEqual([]);
	});
});
