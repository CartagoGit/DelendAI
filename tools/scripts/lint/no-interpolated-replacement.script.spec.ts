import { describe, expect, it } from 'vitest';

import { interpolatedReplacementsIn } from './no-interpolated-replacement.script';

describe('interpolatedReplacementsIn', () => {
	it('finds an interpolated template passed as a replacement string', () => {
		const text = [
			'const a = md.replace(blockRe, `${m[1]}${block}`);',
			'const b = s.replace(/^status:.*$/m, `status: ${next}`);',
			"const c = s.replaceAll('{id}', `x${id}`);",
		].join('\n');
		expect(interpolatedReplacementsIn(text).map((hit) => hit.line)).toEqual(
			[1, 2, 3],
		);
	});

	it('lets a function replacement, a plain literal and a nested call through', () => {
		const text = [
			'const a = md.replace(blockRe, () => `${m[1]}${block}`);',
			"const b = s.replace(/a,b/u, 'plain');",
			'const c = s.replace(pick(a, `${b}`), fn);',
			'const d = s.replace(/x/u, `no interpolation`);',
			' * `s.replace(re, `${head}${body}`)` in a comment',
		].join('\n');
		expect(interpolatedReplacementsIn(text)).toEqual([]);
	});
});
