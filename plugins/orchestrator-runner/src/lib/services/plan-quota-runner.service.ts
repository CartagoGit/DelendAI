/**
 * plan-quota-runner.service.ts — runs a plan-quota reader through the CLI
 * seam every hop uses: no shell, the account's environment, a deadline.
 */
import type { IPlanQuotaRunner } from '../contracts/interfaces/plan-quota-reader.interface';
import type { CliSpawner } from '../subprocess/cli';

/** A quota answer is a few kilobytes; anything past this is not one. */
const MAX_ANSWER_CHARS = 1024 * 1024;

/** A reader over `spawner`; a deadline, a crash or no exit code is a failure. */
export const planQuotaRunnerOver =
	(
		spawner: CliSpawner,
		setTimer: (fn: () => void, ms: number) => { clear(): void } = (
			fn,
			ms,
		) => {
			const timer = setTimeout(fn, ms);
			timer.unref();
			return { clear: () => clearTimeout(timer) };
		},
	): IPlanQuotaRunner =>
	(command, args, env, timeoutMs) =>
		new Promise((resolve) => {
			let output = '';
			let settled = false;
			const settle = (code: number): void => {
				if (settled) return;
				settled = true;
				deadline.clear();
				resolve({ code, output });
			};
			const child = spawner(command, args, env);
			const deadline = setTimer(() => {
				child.kill('SIGKILL');
				settle(1);
			}, timeoutMs);
			child.onStdout((chunk) => {
				if (output.length < MAX_ANSWER_CHARS) output += chunk;
			});
			child.onStderr(() => undefined);
			child.on('exit', (code) => settle(code ?? 1));
		});
