/**
 * client-command-runner.service.ts — how a known client's catalogue
 * commands (`command -v`, `--version`, its login status) are run.
 *
 * Discovery ran through a runner the selector kept to itself; the offer
 * of the accounts found needs the same one, and two copies would drift.
 */
import { execFile } from 'node:child_process';

import type { IClientCommandRunner } from '../contracts/interfaces/known-client.interface';

const COMMAND_TIMEOUT_MS = 5_000;

/**
 * A trusted command line (catalogue values only) run through a non-login
 * bash, with a hard timeout so a hung shell can never stall its caller.
 */
export const runClientCommand: IClientCommandRunner = (command, options) =>
	new Promise((resolve) => {
		execFile(
			'/bin/bash',
			['--noprofile', '--norc', '-c', command],
			{
				cwd: options.cwd,
				timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
			},
			(error, stdout, stderr) =>
				resolve({
					code:
						error === null
							? 0
							: typeof error.code === 'number'
								? error.code
								: 1,
					output: `${stdout}${stderr}`,
				}),
		);
	});
