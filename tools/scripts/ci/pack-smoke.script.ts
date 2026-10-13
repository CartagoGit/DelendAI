#!/usr/bin/env bun
/**
 * pack-smoke.script.ts — x00268 (Track G, audit §32).
 *
 * Wraps the pack-smoke command so a failure preserves the full output via
 * GitHub-Actions collapsible groups (`::group::` / `::endgroup::`) and exits
 * with the inner command's exit code.
 *
 * Usage:
 *   bun tools/scripts/ci/pack-smoke.script.ts
 *   bun tools/scripts/ci/pack-smoke.script.ts --command <cmd>
 */

import { spawnSync } from 'node:child_process';
import {
	closeSync,
	fstatSync,
	openSync,
	mkdtempSync,
	readSync,
	rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** The whole file behind `fd`, from its first byte. */
const readFromStart = (fd: number): string => {
	const buffer = Buffer.alloc(fstatSync(fd).size);
	readSync(fd, buffer, 0, buffer.length, 0);
	return buffer.toString('utf8');
};

export const main = (argv: readonly string[]): number => {
	let command = ['bun', 'tools/scripts/smoke/pack.script.ts'];
	if (argv[0] === '--command') {
		if (argv.length < 2) {
			console.error(
				'pack-smoke.script.ts: --command requires at least one argument',
			);
			return 2;
		}
		command = [...argv.slice(1)];
	}

	const tempDir = mkdtempSync(join(tmpdir(), 'delendai-pack-smoke-'));
	const outputPath = join(tempDir, 'output.log');
	const outputFd = openSync(outputPath, 'w+', 0o600);
	let result: ReturnType<typeof spawnSync>;
	let capturedOutput = '';
	try {
		result = spawnSync(command[0] as string, command.slice(1), {
			stdio: ['ignore', outputFd, outputFd],
		});
		// Read back through the descriptor it was written to.
		capturedOutput = readFromStart(outputFd);
	} finally {
		closeSync(outputFd);
	}
	const output = result.error
		? `${capturedOutput}${capturedOutput.endsWith('\n') || capturedOutput.length === 0 ? '' : '\n'}pack-smoke: failed to start command: ${result.error.message}\n`
		: capturedOutput;
	rmSync(tempDir, { recursive: true, force: true });
	const status = result.status ?? 1;

	console.log(`::group::pack-smoke output (exit=${status})`);
	process.stdout.write(output);
	if (!output.endsWith('\n')) process.stdout.write('\n');
	console.log('::endgroup::');
	if (status !== 0) {
		console.log(`::error::pack-smoke failed with exit ${status}`);
	}
	return status;
};

if (import.meta.main) process.exit(main(process.argv.slice(2)));
