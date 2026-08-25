import { describe, expect, it } from 'vitest';

import { runArgv } from '../../../../src/lib/shared/run-command';

const execEval = async (
	script: string,
	options?: Parameters<typeof runArgv>[1],
) => runArgv([process.execPath, '-e', script], options);

describe('runArgv byte budgets (x00220)', () => {
	it('caps stdout by real UTF-8 bytes, not UTF-16 code units', async () => {
		const payload = '🙂é';
		const result = await execEval(
			`process.stdout.write(${JSON.stringify(payload)});`,
			{ maxOutputBytes: 4 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('🙂');
		expect(result.stderr).toBe('');
	});

	it('truncates a chunk to the exact remaining bytes and decodes partial UTF-8 with replacement', async () => {
		const payload = '🙂';
		const result = await execEval(
			`process.stdout.write(${JSON.stringify(payload)});`,
			{ maxOutputBytes: 3 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('');
	});

	it('never leaves a replacement character when the combined budget cuts inside a multibyte character', async () => {
		const payload = 'ab🙂';
		const result = await execEval(
			`process.stdout.write(${JSON.stringify(payload)});`,
			{ maxOutputBytes: 5 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('ab');
		expect(result.stdout).not.toContain('\uFFFD');
	});

	it('enforces maxOutputBytes across stdout and stderr combined', async () => {
		const result = await execEval(
			[
				"process.stdout.write('abcd');",
				"process.stderr.write('WXYZ');",
			].join(''),
			{ maxOutputBytes: 6 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('abcd');
		expect(result.stderr).toBe('WX');
		expect(
			Buffer.byteLength(result.stdout, 'utf8') +
				Buffer.byteLength(result.stderr, 'utf8'),
		).toBe(6);
	});

	it('applies optional per-stream byte budgets on top of the combined budget', async () => {
		const result = await execEval(
			[
				"process.stdout.write('abcdef');",
				"process.stderr.write('WXYZ');",
			].join(''),
			{ maxOutputBytes: 10, maxStdoutBytes: 3, maxStderrBytes: 2 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('abc');
		expect(result.stderr).toBe('WX');
		expect(
			Buffer.byteLength(result.stdout, 'utf8') +
				Buffer.byteLength(result.stderr, 'utf8'),
		).toBe(5);
	});
});
