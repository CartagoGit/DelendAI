import { describe, expect, it } from 'vitest';

import {
	buildCloseSliceAlreadyClosedResult,
	buildCloseSliceClosedResult,
} from '@delendai/proposals/lib/services/close-slice.service';

describe('close-slice service', () => {
	it('keeps the lifecycle contract for already_closed responses', () => {
		const payload = buildCloseSliceAlreadyClosedResult({
			proposalId: 'f00047',
			requestedSliceId: 's1',
			canonicalSliceId: 'S1',
			path: 'in-progress/f00047-fixture.md',
			idempotencyKey: 'idem-f00047-s1',
		});

		expect(payload).toMatchObject({
			ok: true,
			kind: 'already_closed',
			already_closed: true,
			proposalId: 'f00047',
			sliceId: 's1',
			idempotencyKey: 'idem-f00047-s1',
			entity: {
				entity: 'slice',
				sliceId: 'S1',
			},
		});
	});

	it('keeps the lifecycle contract for closed responses', () => {
		const payload = buildCloseSliceClosedResult({
			proposalId: 'f00047',
			requestedSliceId: 's1',
			canonicalSliceId: 'S1',
			path: 'in-progress/f00047-fixture.md',
		});

		expect(payload).toMatchObject({
			kind: 'closed',
			proposalId: 'f00047',
			sliceId: 's1',
			closed: true,
			entity: {
				entity: 'slice',
				sliceId: 'S1',
			},
		});
	});
});