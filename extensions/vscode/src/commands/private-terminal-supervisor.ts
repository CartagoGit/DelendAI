import type { ICommandVscodeApi, IPrivateTerminal } from './types';

export interface IPrivateTerminalRunResult {
	readonly ok: boolean;
	readonly exitCode?: number;
	readonly timedOut: boolean;
	readonly replacedTerminal: boolean;
	readonly attempts: number;
	readonly reason?: string;
}

export interface IPrivateTerminalRunOptions {
	readonly cwd?: string;
	readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const CTRL_C = '\u0003';

const disposeTerminal = (terminal: IPrivateTerminal | undefined): void => {
	try {
		terminal?.sendText(CTRL_C, false);
	} finally {
		terminal?.dispose();
	}
};

/**
 * Runs a host command in an extension-owned private terminal. A stuck
 * execution is interrupted, disposed, and replaced so the next retry never
 * inherits the old shell state.
 */
export const runInPrivateTerminal = async (
	vscode: ICommandVscodeApi,
	command: string,
	options: IPrivateTerminalRunOptions = {},
): Promise<IPrivateTerminalRunResult> => {
	const createTerminal = vscode.window.createTerminal;
	const onIntegration = vscode.window.onDidChangeTerminalShellIntegration;
	const onEnd = vscode.window.onDidEndTerminalShellExecution;
	if (
		createTerminal === undefined ||
		onIntegration === undefined ||
		onEnd === undefined
	) {
		return {
			ok: false,
			timedOut: false,
			replacedTerminal: false,
			attempts: 0,
			reason: 'VS Code shell integration is unavailable; command was not started',
		};
	}

	const terminal = createTerminal({
		name: 'DelendAI Validation (private)',
		hideFromUser: true,
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
	});
	let execution: object | undefined;
	let integrationDisposable: { dispose(): void } | undefined;
	let endDisposable: { dispose(): void } | undefined;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		const result = await new Promise<IPrivateTerminalRunResult>(
			(resolve) => {
				let settled = false;
				const finish = (value: IPrivateTerminalRunResult): void => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					resolve(value);
				};
				const timer = setTimeout(() => {
					disposeTerminal(terminal);
					finish({
						ok: false,
						timedOut: true,
						replacedTerminal: false,
						attempts: 1,
						reason: `private terminal timed out after ${timeoutMs}ms; terminal was closed`,
					});
				}, timeoutMs);
				endDisposable = onEnd((event) => {
					if (event.execution !== execution) return;
					const exitCode = event.exitCode;
					finish({
						ok: exitCode === 0,
						...(exitCode === undefined ? {} : { exitCode }),
						timedOut: false,
						replacedTerminal: false,
						attempts: 1,
						...(exitCode === 0
							? {}
							: {
									reason: `command exited with code ${String(exitCode)}`,
								}),
					});
				});
				integrationDisposable = onIntegration((event) => {
					if (event.terminal !== terminal || execution !== undefined)
						return;
					execution = event.shellIntegration.executeCommand(command);
				});
				if (terminal.shellIntegration !== undefined) {
					execution =
						terminal.shellIntegration.executeCommand(command);
				}
			},
		);
		return result;
	} finally {
		integrationDisposable?.dispose();
		endDisposable?.dispose();
		disposeTerminal(terminal);
	}
};

/**
 * Retries once in a fresh private terminal after a timeout. The previous
 * terminal is disposed before the retry starts, so continuation prompts and
 * suspended shell state cannot leak into the next attempt.
 */
export const runInPrivateTerminalWithRetry = async (
	vscode: ICommandVscodeApi,
	command: string,
	options: IPrivateTerminalRunOptions = {},
): Promise<IPrivateTerminalRunResult> => {
	const first = await runInPrivateTerminal(vscode, command, options);
	if (!first.timedOut) return first;
	const second = await runInPrivateTerminal(vscode, command, options);
	return {
		...second,
		attempts: first.attempts + second.attempts,
		replacedTerminal: true,
		...(second.ok
			? {}
			: {
					reason: `${first.reason ?? 'private terminal timed out'}; fresh terminal retry failed: ${second.reason ?? 'unknown error'}`,
				}),
	};
};
