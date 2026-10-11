import { describe, expect, it } from 'vitest';

import {
	findSymbolDeclarations,
	findSymbolReferences,
} from '../../../../src/lib/tools/find-symbol';

describe('findSymbolDeclarations', () => {
	it('finds exported declarations and export-from aliases', () => {
		const source = [
			'export function alpha() { return 1; }',
			'export { beta as alpha } from "./beta";',
			'const alpha = "not exported";',
		].join('\n');
		const hits = findSymbolDeclarations('src/demo.ts', source, 'alpha');
		expect(hits).toEqual([
			expect.objectContaining({ kind: 'function', line: 1 }),
			expect.objectContaining({
				kind: 'export-from',
				exportPath: './beta',
			}),
		]);
	});
});

describe('findSymbolReferences', () => {
	it('skips strings and comments while flagging definitions', () => {
		const source = [
			'export function alpha() {',
			'  // alpha',
			'  const msg = "alpha";',
			'  return alpha;',
			'}',
		].join('\n');
		const hits = findSymbolReferences('src/demo.ts', source, 'alpha');
		expect(hits).toHaveLength(2);
		expect(hits[0]?.isDefinition).toBe(true);
		expect(hits[1]?.isDefinition).toBe(false);
	});
});
