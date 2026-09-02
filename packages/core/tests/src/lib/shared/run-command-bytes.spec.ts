import { describe, expect, it } from 'vitest';

import { runArgv, runCommand } from '../../../../src/lib/shared/run-command';

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

	it('drops an incomplete trailing code point instead of decoding it as U+FFFD', async () => {
		const payload = '🙂';
		const result = await execEval(
			`process.stdout.write(${JSON.stringify(payload)});`,
			{ maxOutputBytes: 3 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('');
	});

	it('lets stderr use the shared budget when stdout only has an unrecoverable UTF-8 tail', async () => {
		const result = await execEval(
			[
				'process.stdout.write(Buffer.from([0xF0, 0x9F, 0x99]));',
				"process.stderr.write('abc');",
			].join(''),
			{ maxOutputBytes: 3 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('abc');
		expect(result.stderr).not.toContain('\uFFFD');
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

	it('runCommand preserves stream-local UTF-8 decoding while sharing one byte budget', async () => {
		const result = await runCommand(
			"printf '\\360\\237\\231'; printf 'abc' >&2",
			{ cwd: process.cwd(), maxOutputBytes: 3 },
		);
		expect(result.code).toBe(0);
		expect(result.output).toBe('abc');
		expect(result.output).not.toContain('\uFFFD');
		expect(Buffer.byteLength(result.output, 'utf8')).toBe(3);
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

	// t00014 (PROC-001 regression guard) — the runner MUST re-assemble
	// a UTF-8 character whose bytes arrive in separate `data` events.
	// The `await new Promise(setTimeout)` between writes gives the
	// kernel pipe time to deliver chunk 1 to the parent before chunk 2
	// is written; the runner's chunk concatenation + final
	// `truncateUtf8Buffer` trim is the regression guard against the
	// historical `process.stdout.read()` byte-slice bug.
	it('t00014: chunk split exactly on lead byte re-assembles the rune', async () => {
		// 🎉 is `0xF0 0x9F 0x8E 0x89` (4-byte emoji). Split after the
		// first 2 bytes (lead byte + 1 continuation): the second
		// write carries the remaining 2 continuation bytes.
		const result = await execEval(
			[
				'process.stdout.write(Buffer.from([0xF0, 0x9F]));',
				'await new Promise(r => setTimeout(r, 50));',
				'process.stdout.write(Buffer.from([0x8E, 0x89]));',
			].join('\n'),
			{ maxOutputBytes: 4 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('🎉');
		expect(result.stdout).not.toContain('\uFFFD');
		expect(Buffer.byteLength(result.stdout, 'utf8')).toBe(4);
	});

	it('t00014: chunk split inside continuation bytes re-assembles the rune', async () => {
		// 🎉 is `0xF0 0x9F 0x8E 0x89` (4-byte emoji). Split after the
		// first 3 bytes (lead byte + 2 continuation): the second
		// write carries the remaining 1 continuation byte. This is the
		// historical failure mode — the runner used to slice mid-
		// continuation and emit `\uFFFD`.
		const result = await execEval(
			[
				'process.stdout.write(Buffer.from([0xF0, 0x9F, 0x8E]));',
				'await new Promise(r => setTimeout(r, 50));',
				'process.stdout.write(Buffer.from([0x89]));',
			].join('\n'),
			{ maxOutputBytes: 4 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('🎉');
		expect(result.stdout).not.toContain('\uFFFD');
		expect(Buffer.byteLength(result.stdout, 'utf8')).toBe(4);
	});

	it('t00014: multi-rune split across chunks respects the combined byte cap', async () => {
		// Three 4-byte runes split so that chunk 1 ends mid-rune and
		// chunk 2 completes it. The combined stdout budget is exactly
		// 8 bytes (two full emojis); the third rune must NOT appear.
		const result = await execEval(
			[
				'process.stdout.write(Buffer.from([0xF0, 0x9F, 0x8E, 0x89, 0xF0, 0x9F]));',
				'await new Promise(r => setTimeout(r, 50));',
				'process.stdout.write(Buffer.from([0x8E, 0x89, 0xF0, 0x9F, 0x8E, 0x89]));',
			].join('\n'),
			{ maxOutputBytes: 8 },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('🎉🎉');
		expect(result.stdout).not.toContain('\uFFFD');
		expect(Buffer.byteLength(result.stdout, 'utf8')).toBe(8);
	});
});
