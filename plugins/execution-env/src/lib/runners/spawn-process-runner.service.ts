// effect-boundary-authorized: this module IS the host process adapter; every execution environment starts its host binaries through it, behind the dry-run guard.
import { spawn } from 'node:child_process';

import { guardEffectCapability } from '@delendai/core/public';

import type {
	IProcessRunOptions,
	IProcessRunner,
	IProcessRunResult,
} from '../contracts/interfaces/process-runner.interface';

/** Conventional shell exit status for "command not found". */
const EXIT_NOT_FOUND = 127;
/** Exit status reported when the run is cut off by its timeout. */
const EXIT_TIMED_OUT = 124;

const runOnce = (
	argv: readonly string[],
	options: IProcessRunOptions = {},
): Promise<IProcessRunResult> =>
	new Promise((resolve) => {
		const [binary, ...args] = argv;
		if (binary === undefined || binary.length === 0) {
			resolve({
				exitCode: EXIT_NOT_FOUND,
				stdout: '',
				stderr: 'empty command',
			});
			return;
		}
		// `shell: false` is the point: each element of argv is one
		// argument, so no value can be reinterpreted as syntax.
		const child = spawn(binary, args, {
			cwd: options.cwd,
			env: options.env === undefined ? undefined : { ...options.env },
			shell: false,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let timedOut = false;
		const timer =
			options.timeoutMs === undefined
				? undefined
				: setTimeout(() => {
						timedOut = true;
						child.kill('SIGKILL');
					}, options.timeoutMs);
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.on('error', (error) => {
			if (timer !== undefined) clearTimeout(timer);
			resolve({
				exitCode: EXIT_NOT_FOUND,
				stdout: '',
				stderr: error.message,
			});
		});
		child.on('close', (code) => {
			if (timer !== undefined) clearTimeout(timer);
			resolve({
				exitCode: timedOut ? EXIT_TIMED_OUT : (code ?? 1),
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8'),
			});
		});
		// A command that ignores stdin closes the pipe early; that is
		// not a failure of the run.
		child.stdin.on('error', () => undefined);
		child.stdin.end(options.stdin ?? '');
	});

/**
 * The real runner. While `dryRun` is true, calling it throws a typed
 * refusal instead of starting anything, so the guarantee does not depend
 * on each adapter remembering to check the flag.
 */
export const createSpawnProcessRunner = (dryRun: boolean): IProcessRunner => {
	const guarded = guardEffectCapability<
		[readonly string[], IProcessRunOptions?],
		IProcessRunResult
	>({
		capability: 'spawn',
		dryRun,
		perform: runOnce,
		describe: (argv) => argv[0] ?? '',
	});
	return { run: async (argv, options) => guarded(argv, options) };
};
