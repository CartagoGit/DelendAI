import { describe, expect, it } from 'vitest';

import {
	controlByteLines,
	scanForControlBytes,
} from './no-control-bytes.script';

describe('controlByteLines', () => {
	it('names the line and the byte of a raw control character', () => {
		const nul = String.fromCharCode(0);
		expect(
			controlByteLines('a.ts', `const a = 1;\nconst b = '${nul}';`),
		).toEqual(['a.ts:2 (0x00)']);
	});

	it('allows tab, newline, carriage return and written escapes', () => {
		expect(
			controlByteLines('a.ts', "\tconst a = '\\u0000';\r\nconst b = 2;"),
		).toEqual([]);
	});
});

describe('scanForControlBytes', () => {
	it('names the file it could not read instead of skipping it', () => {
		const result = scanForControlBytes(['ok.ts', 'locked.ts'], (file) => {
			if (file === 'locked.ts') throw new Error('EACCES');
			return 'const a = 1;';
		});
		expect(result.unreadable).toEqual(['locked.ts']);
		expect(result.found).toEqual([]);
	});
});
