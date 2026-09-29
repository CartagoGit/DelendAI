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
