import { describe, expect, it } from 'vitest';

import { truncateUtf8Buffer } from '../../../../src/lib/shared/truncate-utf8';

const samples = [
	'plain ascii',
	'español con ñ',
	'日本語のテキスト',
	'🎉🎊🚀',
	'café résumé naïve',
	'𝐇𝐞𝐥𝐥𝐨',
	'Mixed: ABC 中文 🎉 end',
] as const;

describe('truncateUtf8Buffer', () => {
	for (const sample of samples) {
		const bytes = Buffer.from(sample, 'utf8');
		for (let maxBytes = 0; maxBytes <= bytes.length; maxBytes += 1) {
			it(`preserves UTF-8 boundaries for ${JSON.stringify(sample)} at ${maxBytes} bytes`, () => {
				const result = truncateUtf8Buffer(bytes, maxBytes);
				const text = result.toString('utf8');
				expect(result.length).toBeLessThanOrEqual(maxBytes);
				expect(text).not.toContain('\uFFFD');
				expect(Buffer.from(text, 'utf8').equals(result)).toBe(true);
			});
		}
	}

	it('throws on negative maxBytes', () => {
		expect(() =>
			truncateUtf8Buffer(Buffer.from('hello', 'utf8'), -1),
		).toThrow(RangeError);
	});

	it('returns the original bytes when the payload already fits', () => {
		const input = Buffer.from('hello', 'utf8');
		expect(truncateUtf8Buffer(input, 100)).toEqual(input);
	});
});
