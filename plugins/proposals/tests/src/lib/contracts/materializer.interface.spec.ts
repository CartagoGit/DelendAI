/**
 * materializer.interface.spec.ts — x00510 S3.
 *
 * Locks in the READ ≠ WRITE contract:
 *   1. `IProposalReader` exposes only read methods.
 *   2. `IProposalMaterializer` exposes only `materialize`.
 *   3. `assertReadOnlyCall` rejects any reader wired with a materializer.
 *   4. The outcome enum is discriminated by `kind`.
 */
import { describe, expect, it } from 'vitest';

import {
	READ_ONLY_VIOLATION_MESSAGE,
	assertReadOnlyCall,
	type IProposalMaterializer,
	type IProposalReader,
} from '../../../../src/lib/contracts/interfaces/materializer.interface';

const buildReaderStub = (): IProposalReader => ({
	get: async () => undefined,
	list: async () => [],
	search: async () => [],
	count: async () => ({ proposals: 0, plans: 0, slices: 0 }),
	lastSync: async () => ({ at: undefined, sourceCommit: undefined }),
	suggest: async () => [],
});

const buildMaterializerStub = (): IProposalMaterializer => ({
	materialize: async () => ({
		kind: 'rejected',
		errorCode: 'UNKNOWN',
		errorMessage: 'test stub',
	}),
});

describe('materializer contract (x00510 S3)', () => {
	it('IProposalReader exposes only read methods (no write surface)', () => {
		const reader = buildReaderStub();
		const keys = Object.keys(reader).sort();
		expect(keys).toEqual([
			'count',
			'get',
			'lastSync',
			'list',
			'search',
			'suggest',
		]);
		// No 'create', 'update', 'transition', 'close', 'delete'.
		expect(keys).not.toContain('materialize');
	});

	it('IProposalMaterializer exposes only materialize', () => {
		const mat = buildMaterializerStub();
		const keys = Object.keys(mat).sort();
		expect(keys).toEqual(['materialize']);
	});

	it('assertReadOnlyCall allows a tool with only a reader', () => {
		expect(() =>
			assertReadOnlyCall('proposals_db_status', {
				reader: buildReaderStub(),
			}),
		).not.toThrow();
	});

	it('assertReadOnlyCall rejects a tool that secretly holds a materializer', () => {
		expect(() =>
			assertReadOnlyCall('proposals_db_status', {
				reader: buildReaderStub(),
				materializer: buildMaterializerStub(),
			}),
		).toThrowError(/READ_ONLY_VIOLATION|DLND-PROP-007/);
	});

	it('the error includes the tool id and error code DLND-PROP-007', () => {
		try {
			assertReadOnlyCall('proposals_get', {
				materializer: buildMaterializerStub(),
			});
		} catch (error) {
			expect((error as Error).message).toContain('proposals_get');
			expect((error as Error).message).toContain('DLND-PROP-007');
			expect((error as Error).message).toBe(
				`${READ_ONLY_VIOLATION_MESSAGE} (tool=proposals_get, error=DLND-PROP-007)`,
			);
			return;
		}
		throw new Error('expected assertReadOnlyCall to throw');
	});
});
