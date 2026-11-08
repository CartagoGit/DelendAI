import { describe, expect, it } from 'vitest';

import {
	buildRegistrySkeleton,
	formatFixProposal,
} from '../../../../src/lib/scan/long-chains-fix';

describe('scan/long-chains-fix — buildRegistrySkeleton', () => {
	it('returns a Map skeleton for a 6-case switch on string literals', () => {
		const body = [
			'export const route = (id: string): string => {',
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
		const proposal = buildRegistrySkeleton(
			'plugins/example/src/lib/route.ts',
			body,
		);
		expect(proposal).not.toBeNull();
		expect(proposal?.caseCount).toBe(6);
		expect(proposal?.registry).toContain("'a'");
		expect(proposal?.registry).toContain("'f'");
		expect(proposal?.registry).toContain('new Map');
	});

	it('returns null when there is no long switch', () => {
		const body = [
			'export const route = (id: string) => {',
			'  switch (id) {',
			"    case 'a': return 'A';",
			'  }',
			'};',
		].join('\n');
		expect(buildRegistrySkeleton('plugins/x/route.ts', body)).toBeNull();
	});

	it('formatFixProposal prints both registry and delegate', () => {
		const body = [
			'export const r = (k: string): number => {',
			'  switch (k) {',
			"    case 'a': return 1;",
			"    case 'b': return 2;",
			"    case 'c': return 3;",
			"    case 'd': return 4;",
			"    case 'e': return 5;",
			"    case 'f': return 6;",
			'  }',
			'};',
		].join('\n');
		const p = buildRegistrySkeleton('plugins/x/y/r.ts', body);
		expect(p).not.toBeNull();
		const out = formatFixProposal(p as NonNullable<typeof p>);
		expect(out).toContain('Proposed registry');
		expect(out).toContain('new Map');
		expect(out).toContain('export const');
	});

	it('handles non-string return types (numbers)', () => {
		const body = [
			'export const r = (k: string): number => {',
			'  switch (k) {',
			"    case 'a': return 1;",
			"    case 'b': return 2;",
			"    case 'c': return 3;",
			"    case 'd': return 4;",
			"    case 'e': return 5;",
			"    case 'f': return 6;",
			'  }',
			'};',
		].join('\n');
		const p = buildRegistrySkeleton('plugins/x/r.ts', body);
		expect(p?.registry).toContain('ReadonlyMap<string, number>');
	});
});
