import { describe, expect, it } from 'vitest';

import type {
	IRoadmapBumpDeriver,
	IRoadmapEntry,
	IRoadmapHorizon,
} from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import {
	promisedKinds,
	validateBumpHints,
} from '../../../../src/lib/validation/bump-hint-validator.service';

const entry = (
	id: string,
	kind: IRoadmapEntry['kind'],
	state: IRoadmapEntry['state'] = 'committed',
): IRoadmapEntry => ({ id, title: id, kind, state, gates: [] });

// A stand-in for the real derivation, which the bump-intent service owns.
const deriveBump: IRoadmapBumpDeriver = (kinds) => {
	if (kinds.includes('breaking')) return 'major';
	if (kinds.includes('feature')) return 'minor';
	if (kinds.includes('fix')) return 'patch';
	return 'none';
};

describe('validateBumpHints', () => {
	it('accepts a hint that matches what the entries imply', () => {
		const horizon: IRoadmapHorizon = {
			version: '0.5.0',
			bumpHint: 'minor',
			entries: [entry('a', 'feature'), entry('b', 'fix')],
		};
		expect(validateBumpHints([horizon], deriveBump)).toEqual([]);
	});

	it('rejects a hint the entries contradict', () => {
		const horizon: IRoadmapHorizon = {
			version: '0.5.0',
			bumpHint: 'patch',
			entries: [entry('a', 'feature')],
		};
		const problems = validateBumpHints([horizon], deriveBump);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('declares bumpHint patch');
		expect(problems[0]).toContain('imply minor');
	});

	it('ignores entries the horizon no longer promises', () => {
		const horizon: IRoadmapHorizon = {
			version: '0.5.0',
			bumpHint: 'patch',
			entries: [entry('a', 'feature', 'deferred'), entry('b', 'fix')],
		};
		expect(promisedKinds(horizon)).toEqual(['fix']);
		expect(validateBumpHints([horizon], deriveBump)).toEqual([]);
	});

	it('does not judge a horizon that declares no hint', () => {
		const horizon: IRoadmapHorizon = {
			version: '0.5.0',
			entries: [entry('a', 'breaking')],
		};
		expect(validateBumpHints([horizon], deriveBump)).toEqual([]);
	});
});
