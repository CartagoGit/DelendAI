import { describe, expect, it } from 'vitest';

import {
	configDisablesIsolation,
	isZoneSpec,
	mockCallLines,
	nonIsolatedZones,
} from './vitest-no-mock-without-isolation.script';

describe('vitest-no-mock-without-isolation', () => {
	it('[<200ms] a config spelling isolate: false makes its folder a zone; a commented one does not', () => {
		expect(configDisablesIsolation('test: { isolate: false }')).toBe(true);
		expect(configDisablesIsolation('// isolate: false')).toBe(false);
		expect(configDisablesIsolation('test: { isolate: true }')).toBe(false);
		const configs = new Map([
			['plugins/a/vitest.config.ts', 'isolate: false'],
			['plugins/b/vitest.config.ts', 'name: "b"'],
		]);
		expect(nonIsolatedZones(configs)).toEqual(['plugins/a']);
	});

	it('[<200ms] a vi.mock call is reported with its line; vi.spyOn and comments are not', () => {
		const source = [
			"import { vi } from 'vitest';",
			"vi.spyOn(console, 'log');",
			'// vi.mock("x")',
			"vi.mock('./dep', () => ({}));",
		].join('\n');
		expect(mockCallLines(source)).toEqual([4]);
	});

	it('[<200ms] only specs inside a non-isolated zone are in scope', () => {
		const zones = ['plugins/a'];
		expect(isZoneSpec('plugins/a/tests/x.spec.ts', zones)).toBe(true);
		expect(isZoneSpec('plugins/b/tests/x.spec.ts', zones)).toBe(false);
		expect(isZoneSpec('plugins/a/src/x.ts', zones)).toBe(false);
	});
});
