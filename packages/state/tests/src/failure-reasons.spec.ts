/**
 * failure-reasons.spec.ts — c00515 acceptance.
 *
 * Pins the new `IHydrateFailureReason` values (the four
 * `state_store_*` reasons), the `TDriftDirection` companion type,
 * and the `IStateStoreFailure` diagnostic shape so a future refactor
 * cannot silently regress to the pre-c00515 6-value union (which
 * described only in-memory pipeline failures and had no obligation
 * to surface the durable layer's failure mode).
 *
 * Companion types (`IHydrateResult.storeFailure`) are also pinned so
 * the new diagnostic is wired through the result envelope, not just
 * declared and forgotten.
 */

import { describe, expect, it } from 'vitest';

import type {
	IHydrateFailureReason,
	IHydrateResult,
	IStateStoreFailure,
	TDriftDirection,
} from '../../src/lib/generation';

describe('state/generation — c00515 failure reasons', () => {
	it('IHydrateFailureReason includes the four state_store_* reasons', () => {
		// Compile-time exhaustive check: every value below MUST be a
		// valid `IHydrateFailureReason` literal. If c00515 is reverted
		// (or a future refactor narrows the union), TypeScript will
		// refuse to compile this array.
		const all: readonly IHydrateFailureReason[] = [
			'producer_threw',
			'fingerprint_mismatch',
			'scope_not_supported',
			'snapshot_unavailable',
			'projection_invalid',
			'snapshot_invalid',
			'state_store_unavailable',
			'state_store_corrupt',
			'state_store_schema_unsupported',
			'state_store_stale',
		];
		expect(all).toHaveLength(10);
	});

	it('TDriftDirection includes the four directions', () => {
		const all: readonly TDriftDirection[] = [
			'equal',
			'behind',
			'ahead',
			'diverged',
		];
		expect(all).toHaveLength(4);
	});

	it('IHydrateResult carries storeFailure on the failure branch', () => {
		// The result envelope is widened with an optional storeFailure
		// field; pin that the failure branch can carry it without
		// breaking the success branch.
		const failure: IHydrateResult = {
			ok: false,
			reason: 'state_store_stale',
			detail: 'reconciled_commit_sha is not ancestor-equivalent to HEAD',
			storeFailure: {
				code: 'SQLITE_BUSY',
				reconciledCommitSha: 'abc123',
				headCommitSha: 'def456',
				drift: 'diverged',
			},
		};
		expect(failure.ok).toBe(false);
		if (failure.ok === false) {
			expect(failure.reason).toBe('state_store_stale');
			expect(failure.storeFailure?.drift).toBe('diverged');
		}
	});

	it('IStateStoreFailure carries the right diagnostic for each reason', () => {
		// Each reason maps to a subset of fields; pin the four canonical
		// shapes so a future "unify all reasons" refactor can't silently
		// drop a field.
		const unavailable: IStateStoreFailure = { code: 'SQLITE_BUSY' };
		const corrupt: IStateStoreFailure = {
			pragma: '*** in database main ***',
		};
		const unsupported: IStateStoreFailure = {
			pragma: '7',
			supportedSchemaRange: { min: 1, max: 6 },
			observedSchemaVersion: 7,
		};
		const stale: IStateStoreFailure = {
			reconciledCommitSha: 'aaa',
			headCommitSha: 'bbb',
			drift: 'behind',
		};
		expect(unavailable.code).toBe('SQLITE_BUSY');
		expect(corrupt.pragma).toContain('main');
		expect(unsupported.observedSchemaVersion).toBeGreaterThan(
			unsupported.supportedSchemaRange?.max ?? 0,
		);
		expect(stale.drift).toBe('behind');
	});
});
