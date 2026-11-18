/**
 * work-deliver-coverage-precheck.service.spec.ts — the coverage pre-check
 * asks the proof for its own gate, nothing else.
 */
import { describe, expect, it } from 'vitest';

import { COVERAGE_PRECHECK_GATE } from '../contracts/constants/coverage-precheck.constant';
import { coveragePrecheckFlag } from './work-deliver-coverage-precheck.service';

describe('coveragePrecheckFlag', () => {
	it('[<20ms] names the proof gate that runs the mirror specs alone', () => {
		expect(COVERAGE_PRECHECK_GATE).toBe('coverage-precheck');
		expect(coveragePrecheckFlag()).toBe('--only=coverage-precheck');
	});
});
