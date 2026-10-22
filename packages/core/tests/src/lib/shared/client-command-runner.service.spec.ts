/**
 * client-command-runner.service.spec.ts — a catalogue command line runs
 * through bash; any other value reaches its program as one argument.
 */
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
	runArgv,
	runClientCommand,
} from '../../../../src/lib/shared/client-command-runner.service';

describe('runArgv', () => {
	it('hands each argument over as given, quotes and semicolons included', async () => {
		const hostile = "a';echo pwned;'";
		const done = await runArgv(
			process.execPath,
			[
				'-e',
				'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
				hostile,
			],
			{ cwd: tmpdir() },
		);
		expect(done.code).toBe(0);
		expect(JSON.parse(done.output)).toEqual([hostile]);
	});

	it('reports the exit code of a program that fails', async () => {
		const done = await runArgv(
			process.execPath,
			['-e', 'process.exit(3)'],
			{
				cwd: tmpdir(),
			},
		);
		expect(done.code).toBe(3);
	});
});

describe('runClientCommand', () => {
	it('runs a catalogue command line and reports its answer', async () => {
		const done = await runClientCommand('echo ok', { cwd: tmpdir() });
		expect(done).toEqual({ code: 0, output: 'ok\n' });
	});
});
