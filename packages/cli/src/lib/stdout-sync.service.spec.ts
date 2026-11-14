import { describe, expect, it } from 'vitest';

import { writeStdoutSync } from './stdout-sync.service';

describe('writeStdoutSync', () => {
	it('[<5ms] makes a pipe blocking before it writes the text in one piece', () => {
		const calls: string[] = [];
		writeStdoutSync('{"ok":false}\n', {
			_handle: {
				setBlocking: (blocking) =>
					calls.push(`block:${String(blocking)}`),
			},
			write: (text) => calls.push(`write:${text}`),
		});
		expect(calls).toEqual(['block:true', 'write:{"ok":false}\n']);
	});

	it('[<5ms] writes to a stream that has no handle to make blocking', () => {
		const calls: string[] = [];
		writeStdoutSync('x', { write: (text) => calls.push(text) });
		expect(calls).toEqual(['x']);
	});
});
