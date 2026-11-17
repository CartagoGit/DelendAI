import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { REHEARSAL_GROUPING } from '../../../../src/lib/contracts/constants/rehearsal.constant';
import type {
	IRehearsalRunContext,
	IRehearsalStep,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { idleLimit } from '../../../../src/lib/services/rehearsal-wait.helper';

const step = (
	until: 'merged' | 'labelled' | 'checked',
): Extract<IRehearsalStep, { kind: 'await' }> => ({
	kind: 'await',
	until,
	keys: ['a'],
	seconds: 30,
});
const ctxIn = (mode: 'fast' | 'real'): IRehearsalRunContext =>
	fakePartial<IRehearsalRunContext>({ mode });

describe('the idle limit of an await step', () => {
	it('[<50ms] is at least the real cap for a label in real mode', () => {
		expect(idleLimit(ctxIn('real'), step('labelled'))).toBe(
			REHEARSAL_GROUPING.real.awaitCapSeconds,
		);
	});

	it('[<50ms] is the step seconds in fast mode and for other waits', () => {
		expect(idleLimit(ctxIn('fast'), step('labelled'))).toBe(30);
		expect(idleLimit(ctxIn('real'), step('merged'))).toBe(30);
	});

	it('[<50ms] never goes below the step seconds', () => {
		const long = { ...step('labelled'), seconds: 5000 };
		expect(idleLimit(ctxIn('real'), long)).toBe(5000);
	});
});
