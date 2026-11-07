import { describe, expect, it } from 'vitest';

import {
	EMERGENCY_BYPASS_CAPABILITY,
	validateReleasePromotionPolicy,
} from './index';

describe('release promotion policy', () => {
	it('denies develop to main in the normal flow', () => {
		expect(() =>
			validateReleasePromotionPolicy({
				sourceBranch: 'develop',
				targetBranch: 'main',
			}),
		).toThrowError(
			expect.objectContaining({ code: 'release-source-required' }),
		);
	});

	it('allows only a release branch to main normally', () => {
		expect(
			validateReleasePromotionPolicy({
				sourceBranch: 'release/patch/august-cut',
				targetBranch: 'main',
			}),
		).toMatchObject({
			allowed: true,
			mode: 'normal',
			targetBranch: 'main',
		});
	});

	it('requires emergency reason, capability, and receipt', () => {
		const base = {
			sourceBranch: 'develop',
			targetBranch: 'main' as const,
			mode: 'emergency' as const,
		};
		expect(() => validateReleasePromotionPolicy(base)).toThrowError(
			expect.objectContaining({ code: 'emergency-reason-required' }),
		);
		expect(() =>
			validateReleasePromotionPolicy({
				...base,
				emergency: {
					reason: 'incident',
					capability: 'wrong',
					receipt: 'r-1',
				},
			}),
		).toThrowError(
			expect.objectContaining({ code: 'emergency-capability-required' }),
		);
		expect(() =>
			validateReleasePromotionPolicy({
				...base,
				emergency: {
					reason: 'incident',
					capability: EMERGENCY_BYPASS_CAPABILITY,
					receipt: ' ',
				},
			}),
		).toThrowError(
			expect.objectContaining({ code: 'emergency-receipt-required' }),
		);
	});

	it('returns an auditable emergency decision', () => {
		expect(
			validateReleasePromotionPolicy({
				sourceBranch: 'develop',
				targetBranch: 'main',
				mode: 'emergency',
				emergency: {
					reason: 'security incident',
					capability: EMERGENCY_BYPASS_CAPABILITY,
					receipt: 'receipt-50',
				},
			}),
		).toMatchObject({
			allowed: true,
			mode: 'emergency',
			auditReceipt: 'receipt-50',
		});
	});
});
