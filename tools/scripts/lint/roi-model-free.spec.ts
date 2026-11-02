/**
 * roi-model-free.spec.ts — a model, a price or a currency in the ROI path is found.
 */
import { describe, expect, it } from 'vitest';

import { modelFreeViolations, modelPatterns } from './roi-model-free.script';

const models = modelPatterns({
	data: {
		providers: [{ models: ['acme/zeta-7b', 'nova-2-lite', 's1'] }],
	},
});

const scan = (text: string) =>
	modelFreeViolations(
		[{ path: 'packages/core/src/lib/budgets/x.ts', text }],
		models,
	);

describe('modelFreeViolations', () => {
	it('finds a catalogue model id and a versioned family the catalogue lists', () => {
		expect(scan("const id = 'zeta-7b';")).toHaveLength(1);
		expect(scan("const id = 'zeta-9';")).toHaveLength(1);
	});

	it('finds a price and a currency', () => {
		expect(scan('const cost = $0.25;')).toHaveLength(1);
		expect(scan('// priced in USD')).toHaveLength(1);
	});

	it('leaves bytes, calls, slices and template literals alone', () => {
		expect(
			scan('const b = `${bytes}` + calls; // slice S1, nova of ideas'),
		).toEqual([]);
	});

	it('names nothing to check against when the catalogue lists no model', () => {
		expect(modelPatterns({ data: { providers: [] } })).toEqual([]);
	});
});
