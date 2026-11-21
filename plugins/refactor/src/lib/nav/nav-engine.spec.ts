import { describe, expect, it } from 'vitest';

import { buildNavEngine, parseSourceFile } from './nav-engine';

const SRC = `import { something } from './other';
export const PI = 3.14;

export function greet(name: string): string {
	return \`hello \${name}\`;
}

export class Counter {
	value = 0;
}

export interface Shape {
	area(): number;
}

export type Mode = 'fast' | 'safe';

export enum Color {
	Red,
	Green,
	Blue,
}

const internal = greet(PI.toString());
`;

describe('nav-engine (f00123 S1)', () => {
	const file = parseSourceFile('demo.ts', SRC);
	const engine = buildNavEngine('demo.ts', file);

	it('findReferences returns every identifier occurrence', () => {
		const refs = engine.findReferences('greet');
		// import + declaration + call site
		const lines = refs.map((r) => r.line).sort((a, b) => a - b);
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(refs.some((r) => r.isDefinition)).toBe(true);
	});

	it('findDefinition locates the declaration site', () => {
		const def = engine.findDefinition('Counter');
		expect(def).toBeDefined();
		expect(def?.isDefinition).toBe(true);
		expect(def?.kind).toBe('class');
		expect(def?.name).toBe('Counter');
	});

	it('findDefinition returns undefined for unknown names', () => {
		expect(engine.findDefinition('Unknown')).toBeUndefined();
	});

	it('listSymbols enumerates only exported top-level declarations', () => {
		const symbols = engine.listSymbols().map((s) => s.name);
		expect(symbols).toEqual(
			expect.arrayContaining([
				'PI',
				'greet',
				'Counter',
				'Shape',
				'Mode',
				'Color',
			]),
		);
		expect(symbols).not.toContain('internal');
	});

	it('listSymbols tags each entry with a kind', () => {
		const symbols = engine.listSymbols();
		const byName = new Map(symbols.map((s) => [s.name, s]));
		expect(byName.get('greet')?.kind).toBe('function');
		expect(byName.get('Counter')?.kind).toBe('class');
		expect(byName.get('Shape')?.kind).toBe('interface');
		expect(byName.get('Mode')?.kind).toBe('type');
		expect(byName.get('Color')?.kind).toBe('enum');
		expect(byName.get('PI')?.kind).toBe('variable');
	});
});
