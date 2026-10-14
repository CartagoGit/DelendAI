import { describe, expect, it } from 'vitest';

import { runInPrivateTerminalWithRetry } from '../commands/private-terminal-supervisor';
import type {
	ICommandVscodeApi,
	IPrivateTerminal,
	IPrivateTerminalExecution,
	IPrivateShellIntegration,
} from '../commands/types';

describe('private terminal supervisor', () => {
	it('disposes a timed-out terminal before retrying in a fresh one', async () => {
		const terminals: Array<{ disposed: boolean; sent: string[] }> = [];
		const endListeners: Array<
			(event: {
				readonly execution: IPrivateTerminalExecution;
				readonly exitCode?: number;
			}) => void
		> = [];
		let executionCount = 0;
		const vscode: ICommandVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand() {
					return { dispose() {} };
				},
			},
			window: {
				createTerminal() {
					const state = { disposed: false, sent: [] as string[] };
					terminals.push(state);
					const shellIntegration: IPrivateShellIntegration = {
						executeCommand() {
							const execution = {} as IPrivateTerminalExecution;
							executionCount += 1;
							if (executionCount === 2) {
								queueMicrotask(() => {
									for (const listener of endListeners) {
										listener({ execution, exitCode: 0 });
									}
								});
							}
							return execution;
						},
					};
					const terminal: IPrivateTerminal = {
						shellIntegration,
						sendText(text) {
							state.sent.push(text);
						},
						dispose() {
							state.disposed = true;
						},
					};
					return terminal;
				},
				onDidChangeTerminalShellIntegration() {
					return { dispose() {} };
				},
				onDidEndTerminalShellExecution(callback) {
					endListeners.push(callback);
					return { dispose() {} };
				},
				createWebviewPanel() {
					return { webview: { html: '' } };
				},
			},
		};

		const result = await runInPrivateTerminalWithRetry(vscode, 'sleep 1', {
			timeoutMs: 10,
		});

		expect(result.ok).toBe(true);
		expect(result.timedOut).toBe(false);
		expect(result.replacedTerminal).toBe(true);
		expect(result.attempts).toBe(2);
		expect(terminals).toHaveLength(2);
		expect(terminals.every((terminal) => terminal.disposed)).toBe(true);
		expect(terminals.map((terminal) => terminal.sent[0])).toEqual([
			'\u0003',
			'\u0003',
		]);
	});
});
