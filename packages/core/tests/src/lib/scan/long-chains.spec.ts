import { describe, expect, it } from 'vitest';

import { detectLongChains } from '../../../../src/lib/scan/long-chains';

describe('scan/long-chains — detectLongChains', () => {
	it('returns no hits for a short switch', () => {
		const body = [
			'export const r = (id: string) => {',
			'  switch (id) {',
			"    case 'a': return 'A';",
			"    case 'b': return 'B';",
			'  }',
			'};',
		].join('\n');
		expect(detectLongChains(body, { minArms: 5 })).toHaveLength(0);
	});

	it('flags a 6-case switch', () => {
		const body = [
			'export const r = (id: string) => {',
			'  switch (id) {',
			"    case 'a': return 'A';",
			"    case 'b': return 'B';",
			"    case 'c': return 'C';",
			"    case 'd': return 'D';",
			"    case 'e': return 'E';",
			"    case 'f': return 'F';",
			'  }',
			'};',
		].join('\n');
		const hits = detectLongChains(body, { minArms: 5 });
		expect(hits).toHaveLength(1);
		expect(hits[0]?.kind).toBe('switch');
		expect(hits[0]?.arms).toBe(6);
	});

	it('flags a chain of else-if arms', () => {
		const body = [
			'export const f = (x: number): string => {',
			"  if (x === 1) return 'a';",
			"  else if (x === 2) return 'b';",
			"  else if (x === 3) return 'c';",
			"  else if (x === 4) return 'd';",
			"  else if (x === 5) return 'e';",
			"  else if (x === 6) return 'f';",
			"  return 'unknown';",
			'};',
		].join('\n');
		const hits = detectLongChains(body, { minArms: 5 });
		// 1 `if` + 5 `else if` = 6 arms in the chain.
		expect(hits.some((h) => h.kind === 'else-if')).toBe(true);
	});

	it('respects the minArms threshold', () => {
		const body = [
			'export const r = (id: string) => {',
			'  switch (id) {',
			"    case 'a': return 'A';",
			"    case 'b': return 'B';",
			"    case 'c': return 'C';",
			"    case 'd': return 'D';",
			'  }',
			'};',
		].join('\n');
		expect(detectLongChains(body, { minArms: 3 }).length).toBeGreaterThan(
			0,
		);
		expect(detectLongChains(body, { minArms: 5 })).toHaveLength(0);
	});
});
