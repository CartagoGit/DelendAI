import { describe, expect, it } from 'vitest';

import {
	assertExpectedFinalReleaseState,
	buildReleaseReceipt,
} from '../../src/lib/contracts/release-finalize';

describe('release finalize contracts', () => {
	it('requires the expected final state to remain unchanged', () => {
		expect(() =>
			assertExpectedFinalReleaseState(
				{
					releaseBranchSha: 'aaaaaaa',
					mainSha: 'bbbbbbb',
					targetVersion: '1.2.3',
				},
				{
					releaseBranchSha: 'ccccccc',
					mainSha: 'bbbbbbb',
					targetVersion: '1.2.3',
				},
			),
		).toThrow('release branch changed');
	});

	it('builds immutable receipts', () => {
		const receipt = buildReleaseReceipt({
			operation: 'abort',
			status: 'aborted',
			actor: 'agent',
			releaseSlug: 'test-release',
		});
		expect(receipt.timestamp).toBeTruthy();
		expect(Object.isFrozen(receipt)).toBe(true);
	});
});
