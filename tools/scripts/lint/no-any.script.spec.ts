import { describe, expect, it } from 'vitest';

import { findAsAny, formatReport } from './no-any.script';

const mkMap = (files: Record<string, string>): Map<string, string> =>
	new Map(Object.entries(files));

describe('findAsAny', () => {
	it('clean fixture: zero findings', () => {
		const findings = findAsAny(
			mkMap({
				'plugins/example/src/lib/a.ts': [
					'export const id = (x: unknown): string => String(x);',
					'',
				].join('\n'),
			}),
		);
		expect(findings).toHaveLength(0);
	});

	it('flags a bare `as any` cast', () => {
		const findings = findAsAny(
			mkMap({
				'plugins/example/src/lib/b.ts': [
					'export const bad = (x: unknown): number => (x as any).n;',
					'',
				].join('\n'),
			}),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			relPath: 'plugins/example/src/lib/b.ts',
			line: 1,
		});
	});

	it('does NOT flag `as unknown as <T>` (a separate, more nuanced case — see x00157)', () => {
		const findings = findAsAny(
			mkMap({
				'plugins/example/src/lib/c.ts': [
					'export const bridged = (x: unknown): string =>',
					'  (x as unknown as { name: string }).name;',
					'',
				].join('\n'),
			}),
		);
		expect(findings).toHaveLength(0);
	});

	it('ignores `as any` inside a comment', () => {
		const findings = findAsAny(
			mkMap({
				'plugins/example/src/lib/d.ts': [
					'// legacy note: used to be `x as any` here',
					'export const clean = (x: number): number => x;',
					'',
				].join('\n'),
			}),
		);
		expect(findings).toHaveLength(0);
	});

	it('sorts findings by (relPath, line)', () => {
		const findings = findAsAny(
			mkMap({
				'plugins/b/src/lib/x.ts': 'const y = 1 as any;\n',
				'plugins/a/src/lib/x.ts': [
					'const z = 1 as any;',
					'const w = 2 as any;',
				].join('\n'),
			}),
		);
		expect(findings.map((f) => `${f.relPath}:${f.line}`)).toEqual([
			'plugins/a/src/lib/x.ts:1',
			'plugins/a/src/lib/x.ts:2',
			'plugins/b/src/lib/x.ts:1',
		]);
	});
});

describe('formatReport', () => {
	it('reports clean when there are no findings', () => {
		expect(formatReport([])).toContain('✓');
	});

	it('lists every finding with a fix hint when not clean', () => {
		const out = formatReport([
			{ relPath: 'a.ts', line: 3, snippet: 'const x = y as any;' },
		]);
		expect(out).toContain('✖');
		expect(out).toContain('a.ts:3');
		expect(out).toContain('narrow with a type guard');
	});
});
