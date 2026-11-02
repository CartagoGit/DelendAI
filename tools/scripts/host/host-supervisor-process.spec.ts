/**
 * host-supervisor-process.spec.ts — when a process supervises, and how it
 * reads the stdio it relays (x00756).
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
	eachLine,
	SUPERVISE_ENV,
	SUPERVISED_ENV,
	shouldSupervise,
	restartNotice,
} from './host-supervisor-process';

describe('shouldSupervise', () => {
	it('supervises the process a host starts', () => {
		expect(shouldSupervise({})).toBe(true);
	});

	it('serves in the child, when switched off, and under the boot test', () => {
		expect(shouldSupervise({ [SUPERVISED_ENV]: '1' })).toBe(false);
		expect(shouldSupervise({ [SUPERVISE_ENV]: '0' })).toBe(false);
		expect(shouldSupervise({ DELENDAI_TEST_READY: '1' })).toBe(false);
	});
});

describe('eachLine', () => {
	it('yields each complete line once, across chunks, without blank ones', () => {
		const stream = new PassThrough();
		const lines: string[] = [];
		eachLine(stream, (line) => lines.push(line));
		stream.write('{"a":1}\n{"b"');
		stream.write(':2}\r\n\n{"c":3}');
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
		stream.write('\n');
		expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
	});
});

describe('restartNotice', () => {
	it('says what the server ran before the restart, without the present-tense claim', () => {
		const notice = restartNotice(
			'This delendai server started at aaaaaaaaa; the checkout is at bbbbbbbbb, and 3 source file(s) it runs have changed since. It still applies the rules it started with.',
		);
		expect(notice).toBe(
			"[delendai] restarted onto the checkout's current code. Before the restart: the server had started at aaaaaaaaa; the checkout is at bbbbbbbbb, and 3 source file(s) it runs have changed since.",
		);
		expect(notice).not.toContain('still applies');
	});
});
