import { describe, expect, it } from 'vitest';

import type { IPromotionEvidence } from '../../../../src/lib/contracts/interfaces/promotion-readiness.interface';
import { promotionReadiness } from '../../../../src/lib/promotion/promotion-readiness.service';

const green: IPromotionEvidence = {
	checks: [{ name: 'validate', conclusion: 'success' }],
	openAlerts: 0,
	roadmap: { version: '1.2.0', status: 'ready', reason: 'all delivered' },
};

describe('promotionReadiness', () => {
	it('is ready when the checks are green, nothing is open and the roadmap is ready', () => {
		const readiness = promotionReadiness(green);
		expect(readiness.ready).toBe(true);
		expect(readiness.version).toBe('1.2.0');
		expect(readiness.heldBackBy).toEqual([]);
		expect(readiness.evidence).toEqual([
			'validate concluded success',
			'code scanning reports no open alert',
			'roadmap 1.2.0: all delivered',
		]);
	});

	it('names every condition that holds it back, not just the first', () => {
		const readiness = promotionReadiness({
			checks: [
				{ name: 'validate', conclusion: 'failure' },
				{ name: 'scan', conclusion: undefined },
			],
			openAlerts: 3,
			roadmap: {
				version: '1.2.0',
				status: 'not-ready',
				reason: 'b is open',
			},
		});
		expect(readiness.ready).toBe(false);
		expect(readiness.heldBackBy).toEqual([
			'validate concluded failure',
			'scan has not reported on the head of the integration branch',
			'3 code scanning alert(s) are open on the integration branch',
			'roadmap 1.2.0: b is open',
		]);
	});

	it('is held back by a roadmap that is unknown, as much as by one that failed', () => {
		const readiness = promotionReadiness({
			...green,
			roadmap: {
				version: '1.2.0',
				status: 'unknown',
				reason: 'no evidence',
			},
		});
		expect(readiness.ready).toBe(false);
	});

	it('is held back when the forge could not be asked for the alerts', () => {
		const readiness = promotionReadiness({
			...green,
			openAlerts: undefined,
		});
		expect(readiness.heldBackBy).toEqual([
			'the forge could not be asked for the code scanning alerts',
		]);
	});

	it('is not held back by a project without code scanning or without a pending version', () => {
		const readiness = promotionReadiness({
			checks: [],
			openAlerts: null,
			roadmap: undefined,
		});
		expect(readiness.ready).toBe(true);
		expect(readiness.version).toBeUndefined();
		expect(readiness.evidence).toHaveLength(2);
	});
});
