/**
 * host-supervisor-process.ts — the supervisor wired to real processes: the
 * host's stdio on one side, a server child on the other, and a check of
 * the checkout's code once a minute (x00756).
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaleRuntimeWatch } from '@delendai/core/public';

import { createHostSupervisor } from './host-supervisor';
import type { ISupervisedChild } from './host-supervisor.interface';

/** Set on the child, so it serves instead of supervising again. */
export const SUPERVISED_ENV = 'DELENDAI_SUPERVISED';
/** `0` runs the server without a supervisor. */
export const SUPERVISE_ENV = 'DELENDAI_SUPERVISE';

const CHECK_INTERVAL_MS = 60_000;

/** Whether this process should supervise rather than serve. */
export const shouldSupervise = (env: NodeJS.ProcessEnv): boolean =>
	env[SUPERVISED_ENV] !== '1' &&
	env[SUPERVISE_ENV] !== '0' &&
	env.DELENDAI_TEST_READY !== '1';

/** Calls `listener` with each complete line of a stream. */
export const eachLine = (
	stream: NodeJS.ReadableStream,
	listener: (line: string) => void,
): void => {
	let buffer = '';
	stream.setEncoding('utf8');
	stream.on('data', (chunk: string) => {
		buffer += chunk;
		for (;;) {
			const end = buffer.indexOf('\n');
			if (end === -1) return;
			const line = buffer.slice(0, end).replace(/\r$/u, '');
			buffer = buffer.slice(end + 1);
			if (line.length > 0) listener(line);
		}
	});
};

const spawnServer =
	(script: string, argv: readonly string[]) => (): ISupervisedChild => {
		const child = spawn(process.execPath, [script, ...argv], {
			env: { ...process.env, [SUPERVISED_ENV]: '1' },
			stdio: ['pipe', 'pipe', 'inherit'],
		});
		return {
			send: (line) => {
				child.stdin.write(`${line}\n`);
			},
			onLine: (listener) => eachLine(child.stdout, listener),
			onExit: (listener) => {
				child.on('exit', (code) => listener(code));
			},
			stop: () => {
				child.kill('SIGTERM');
			},
		};
	};

/**
 * Relays the host to a server child and moves to a fresh child whenever
 * the checkout's runtime code changes under it.
 */
export const runSupervised = (
	script: string,
	argv: readonly string[],
): void => {
	const sourceRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		'../../..',
	);
	const supervisor = createHostSupervisor({
		spawn: spawnServer(script, argv),
		toHost: (line) => {
			process.stdout.write(`${line}\n`);
		},
		log: (line) => {
			process.stderr.write(`${line}\n`);
		},
	});
	eachLine(process.stdin, supervisor.fromHost);
	// The code the children run is the delendai checkout's, which is not
	// the workspace when delendai serves another project.
	let watch = createStaleRuntimeWatch(sourceRoot);
	const check = setInterval(() => {
		void watch.behind().then(async (reason) => {
			if (reason === undefined) return;
			const outcome = await supervisor.restart();
			if (outcome.restarted) {
				process.stderr.write(
					`[delendai] restarted onto the checkout's current code. ${reason}\n`,
				);
				watch = createStaleRuntimeWatch(sourceRoot);
			}
		});
	}, CHECK_INTERVAL_MS);
	const end = (code: number): void => {
		clearInterval(check);
		supervisor.stop();
		process.exit(code);
	};
	// `kill -USR2 <pid>` moves to a fresh server now, whatever the checkout.
	// POSIX only: Windows has no user signals.
	if (process.platform !== 'win32')
		process.on('SIGUSR2', () => {
			void supervisor.restart().then((outcome) => {
				process.stderr.write(
					outcome.restarted
						? '[delendai] restarted on request.\n'
						: `[delendai] restart on request did not happen: ${outcome.reason}.\n`,
				);
			});
		});
	process.stdin.on('end', () => end(0));
	process.on('SIGTERM', () => end(143));
	process.on('SIGINT', () => end(130));
	process.on('SIGHUP', () => end(129));
};
