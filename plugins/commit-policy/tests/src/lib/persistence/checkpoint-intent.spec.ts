/**
 * checkpoint-intent.spec.ts — pins the durability / candidate split,
 * because nothing downstream can recover it from the commit object.
 */

import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';

import { classifyCheckpointIntent } from '../../../../src/lib/persistence/checkpoint-intent';

const CONTINUOUS = expandProfile('shared-checkout-pr');

describe('classifyCheckpointIntent', () => {
	it('makes an interval trigger a durability checkpoint', () => {
		const classification = classifyCheckpointIntent({
			triggerKind: 'interval',
			hasSliceSelector: false,
			policy: CONTINUOUS,
		});
		expect(classification.intent).toBe('durability');
		expect(classification.eligibleForIntegration).toBe(false);
		expect(classification.mayBeRed).toBe(true);
	});

	it('makes a threshold trigger a durability checkpoint', () => {
		expect(
			classifyCheckpointIntent({
				triggerKind: 'threshold',
				hasSliceSelector: false,
				policy: CONTINUOUS,
			}).intent,
		).toBe('durability');
	});

	it('makes a slice boundary a merge candidate', () => {
		const classification = classifyCheckpointIntent({
			triggerKind: 'slice',
			hasSliceSelector: true,
			policy: CONTINUOUS,
		});
		expect(classification.intent).toBe('candidate');
		expect(classification.eligibleForIntegration).toBe(true);
		// A candidate is validated by the integration engine; redness is
		// never pre-authorised for it.
		expect(classification.mayBeRed).toBe(false);
	});

	it('treats a manual commit naming a slice as a candidate, a bare one as durability', () => {
		expect(
			classifyCheckpointIntent({
				triggerKind: 'manual',
				hasSliceSelector: true,
				policy: CONTINUOUS,
			}).intent,
		).toBe('candidate');
		expect(
			classifyCheckpointIntent({
				triggerKind: 'manual',
				hasSliceSelector: false,
				policy: CONTINUOUS,
			}).intent,
		).toBe('durability');
	});

	it('never produces a candidate when the cadence is interval-only', () => {
		const intervalOnly: IResolvedDevelopmentPolicy = {
			...CONTINUOUS,
			checkpoint: {
				strategy: 'interval',
				intervalMinutes: 5,
				durableWip: true,
			},
		};
		const classification = classifyCheckpointIntent({
			triggerKind: 'slice',
			hasSliceSelector: true,
			policy: intervalOnly,
		});
		expect(classification.intent).toBe('durability');
		expect(classification.reason).toContain('interval');
	});

	it('forbids a red durability checkpoint when durableWip is off', () => {
		const noDurableWip: IResolvedDevelopmentPolicy = {
			...CONTINUOUS,
			checkpoint: { ...CONTINUOUS.checkpoint, durableWip: false },
		};
		expect(
			classifyCheckpointIntent({
				triggerKind: 'interval',
				hasSliceSelector: false,
				policy: noDurableWip,
			}).mayBeRed,
		).toBe(false);
	});
});
