/**
 * real-deps.ts — the ONE place that touches the OS for discovery.
 *
 * `discoverRoster` is pure over `IDiscoveryDeps`; this module supplies the
 * production seam (a real `command -v` probe + `process.env`). Keeping the I/O
 * here means the discovery logic stays 100% unit-testable and this thin
 * adapter is the only thing that needs the runtime.
 */
import { execFile } from 'node:child_process';

import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';

/**
 * True when `command` resolves on PATH. Uses `bash -lc 'command -v <cmd>'`
 * (a POSIX builtin) with a hard timeout so a hung shell can never stall the
 * server. `command` is passed as an argv element, never interpolated into the
 * script string, so a crafted name cannot inject.
 */
const commandExists = (command: string): Promise<boolean> =>
	new Promise((resolve) => {
		execFile(
			'/bin/bash',
			[
				'--noprofile',
				'--norc',
				'-c',
				'command -v "$1"',
				'probe',
				command,
			],
			{ timeout: 3000 },
			(error) => resolve(error === null),
		);
	});

/** Production discovery deps: real PATH probe + `process.env`. */
export const realDiscoveryDeps = (): IDiscoveryDeps => ({
	commandExists,
	env: process.env,
});
