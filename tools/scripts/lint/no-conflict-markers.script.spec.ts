import { describe, expect, it } from 'vitest';

import { markerLines } from './no-conflict-markers.script';

describe('markerLines', () => {
	it('finds the lines git writes to open and close a conflict', () => {
		const text = [
			'a',
			'<<<<<<< HEAD',
			'ours',
			'=======',
			'theirs',
			'>>>>>>> abc123',
			'b',
		].join('\n');
		expect(markerLines('doc.md', text)).toEqual(['doc.md:2', 'doc.md:6']);
	});

	it('leaves a markdown underline and a marker quoted in a string alone', () => {
		const text = ['Title', '=======', "const x = '<<<<<<< ours';"].join(
			'\n',
		);
		expect(markerLines('doc.md', text)).toEqual([]);
	});
});
