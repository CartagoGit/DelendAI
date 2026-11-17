import { describe, expect, it } from 'vitest';

import { findUncappedSuites } from './bun-suite-has-a-ceiling.script';

describe('bun-suite-has-a-ceiling (x00588)', () => {
	it('refuses a bun suite running on the five-second default', () => {
		expect(
			findUncappedSuites({ 'test:x': 'bun test packages/x/' }),
		).toHaveLength(1);
	});

	it('accepts one that states its ceiling', () => {
		expect(
			findUncappedSuites({
				'test:x': 'bun test --timeout 30000 packages/x/',
			}),
		).toEqual([]);
	});

	it('sees a suite chained behind another command', () => {
		expect(
			findUncappedSuites({
				'test:all': 'bun run build && bun test src/',
			}),
		).toHaveLength(1);
	});

	it('says nothing about scripts that are not the test runner', () => {
		// `bun tools/…` and `bun run test:x` are not the runner, and a rule
		// that fired on them would be turned off.
		expect(
			findUncappedSuites({
				gen: 'bun tools/scripts/gen/x.ts',
				validate: 'bun run test:x',
				build: 'bun build ./src/index.ts',
			}),
		).toEqual([]);
	});

	it('names the script and its command, so the fix is obvious', () => {
		const [finding] = findUncappedSuites({
			'test:y': 'bun test packages/y/',
		});
		expect(finding?.script).toBe('test:y');
		expect(finding?.command).toContain('bun test');
	});
});
