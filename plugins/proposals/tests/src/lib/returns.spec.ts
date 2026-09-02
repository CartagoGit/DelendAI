import { describe, expect, it } from 'vitest';

import {
	proposalFailure,
	proposalSuccess,
	toProposalEntityRef,
} from '../../../src/lib/returns';
import type { ProposalOperationResult } from '../../../src/lib/contracts/interfaces/proposal-return-envelope.interface';

describe('returns — r00033 S1 pilot adoption', () => {
	it('mints an EntityRef narrowed to proposals-owned kinds', () => {
		expect(toProposalEntityRef('proposal', 'r00033')).toEqual({
			kind: 'proposal',
			id: 'r00033',
		});
		expect(toProposalEntityRef('slice', 'S1', 'S1 — pilot')).toEqual({
			kind: 'slice',
			id: 'S1',
			displayName: 'S1 — pilot',
		});
	});

	it('proposalSuccess mints a frozen OperationResult success envelope', () => {
		const result: ProposalOperationResult<{ id: string }> = proposalSuccess(
			{
				id: 'r00033',
			},
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({ id: 'r00033' });
		}
		expect(Object.isFrozen(result)).toBe(true);
	});

	it('proposalFailure mints a discriminated failure envelope', () => {
		const result: ProposalOperationResult<never> = proposalFailure({
			code: 'NOT_FOUND',
			message: 'r00033 not found',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('NOT_FOUND');
		}
	});
});
