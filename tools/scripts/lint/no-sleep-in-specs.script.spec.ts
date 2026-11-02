import { describe, expect, it } from 'vitest';

import { WAIVER_MARKER } from './no-sleep-in-specs.constant';
import { findSleeps, sleepsIn } from './no-sleep-in-specs.script';

describe('no-sleep-in-specs (x00590)', () => {
	it('finds the shape that cost three candidates a red check', () => {
		expect(
			sleepsIn(
				'await new Promise((resolve) => setTimeout(resolve, 400));',
			),
		).toHaveLength(1);
	});

	it('knows the other spellings of waiting', () => {
		expect(sleepsIn('await sleep(500);')).toHaveLength(1);
		expect(sleepsIn('await delay(30);')).toHaveLength(1);
		expect(sleepsIn('await Bun.sleep(10);')).toHaveLength(1);
	});

	it('says nothing about a setTimeout that merely schedules', () => {
		// Scheduling is normal, and is often the subject of the test. What
		// is refused is AWAITING a duration.
		expect(sleepsIn('setTimeout(() => { ready = true; }, 30);')).toEqual(
			[],
		);
		expect(sleepsIn('vi.advanceTimersByTime(1000);')).toEqual([]);
		expect(sleepsIn('await waitUntil("ready", () => ready);')).toEqual([]);
	});

	it('accepts a waiver on the line, and on the line above it', () => {
		// The reason belongs where a reader naturally writes it.
		expect(
			sleepsIn(
				`await sleep(50); // ${WAIVER_MARKER}: measures the backoff`,
			),
		).toEqual([]);
		expect(
			sleepsIn(
				`// ${WAIVER_MARKER}: measures the backoff\nawait sleep(50);`,
			),
		).toEqual([]);
	});

	it('reports the file, the line and what it saw', () => {
		const [finding] = findSleeps([
			{ path: 'a.spec.ts', text: 'x\nawait Bun.sleep(10);\n' },
		]);
		expect(finding?.path).toBe('a.spec.ts');
		expect(finding?.line).toBe(2);
		expect(finding?.match).toContain('Bun.sleep');
	});
});
