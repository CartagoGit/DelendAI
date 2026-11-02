import { describe, expect, it } from 'vitest';

import { assessStaleAcceptance } from '@delendai/proposals/lib/services/checkpoint-advisory-stale-acceptance.service';
import type { ISliceAcceptanceEvidence } from '@delendai/proposals/lib/services/slice-acceptance-evidence.service';

const evidence = (
	partial: Partial<ISliceAcceptanceEvidence>,
): ISliceAcceptanceEvidence => ({
	sliceId: 'S7',
	gitTreeHash: 'tree1',
	lastMeaningfulChangeAt: '2026-08-23T12:00:00.000Z',
	requiresValidation: true,
	...partial,
});

describe('assessStaleAcceptance', () => {
	it('allows push after a successful validation that post-dates the change', () => {
		expect(
			assessStaleAcceptance(
				evidence({
					validatedAt: '2026-08-23T12:05:00.000Z',
					validationPassed: true,
					acceptanceSatisfied: true,
				}),
				'push',
			),
		).toBeNull();
	});

	it('blocks push when validation predates the latest meaningful change', () => {
		const advisory = assessStaleAcceptance(
			evidence({
				validatedAt: '2026-08-23T11:00:00.000Z',
				validationPassed: true,
				lastMeaningfulChangeAt: '2026-08-23T12:00:00.000Z',
			}),
			'push',
		);
		expect(advisory?.severity).toBe('block');
		expect(advisory?.nextAction).toBe('validate-before-push');
		expect(advisory?.dedupeKey).toBe('STALE_ACCEPTANCE:S7:tree1');
	});

	it('warns only (recommend) on commit with incomplete acceptance', () => {
		const advisory = assessStaleAcceptance(
			evidence({
				acceptanceSatisfied: false,
			}),
			'commit',
		);
		expect(advisory?.severity).toBe('recommend');
	});

	it('does not invent a blocker when validation is not required', () => {
		expect(
			assessStaleAcceptance(
				evidence({
					requiresValidation: false,
				}),
				'push',
			),
		).toBeNull();
	});
});
