/**
 * One act refreshes both projections of the proposal markdown.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	levelProjection,
	reconcileProjection,
} from '../../../../src/lib/services/projection-refresh';

const output = {
	status: 'ok' as const,
	reason: null,
	created: false,
	dryRun: false,
	databasePath: '/tmp/db',
	stagingPath: '/tmp/db.staging',
	statePath: '/tmp',
	sourceCommit: '0f2a7216a8e1c37a7d719c4936148e560ea5b754',
	filesScanned: 979,
	filesReconciled: 973,
	excluded: [],
};

describe('reconcileProjection', () => {
	it('reconciles the markdown the registry was just built from', () => {
		// The point of the change: the registry and the database are two
		// views of ONE tree, and they were taken at different times — the
		// registry on every commit, the database only when somebody ran a
		// tool by hand. Measured on this repository before the change:
		// twelve proposals diverged, every one written that day.
		const reconcile = vi.fn().mockReturnValue(output);
		const result = reconcileProjection({
			root: '/repo',
			proposalsDir: 'docs/delendai/proposals',
			reconcile,
		});

		expect(reconcile).toHaveBeenCalledWith({
			workspaceRoot: '/repo',
			proposalsDirAbs: '/repo/docs/delendai/proposals',
		});
		expect(result.status).toBe('refreshed');
		expect(result.lines.join('\n')).toContain('973 of 979');
		expect(result.lines.join('\n')).toContain('0f2a7216a');
	});

	it('names what it could not project, without drowning the hook', () => {
		const reconcile = vi.fn().mockReturnValue({
			...output,
			excluded: [
				{ path: 'a.md', code: 'unparseable', message: 'x' },
				{ path: 'b.md', code: 'unparseable', message: 'x' },
				{ path: 'c.md', code: 'unparseable', message: 'x' },
				{ path: 'd.md', code: 'unparseable', message: 'x' },
			],
		});
		const result = reconcileProjection({
			root: '/repo',
			proposalsDir: 'docs/delendai/proposals',
			reconcile,
		});
		const text = result.lines.join('\n');
		expect(text).toContain('4 excluded');
		expect(text).toContain('a.md, b.md, c.md');
		expect(text).toContain('…');
		expect(text).not.toContain('d.md');
	});

	it('reports a failure and does not throw, because the registry is already correct', () => {
		// A database that could not be reconciled is a stale cache, not a
		// lost proposal: the reader falls back to the registry, which is
		// written first and on its own correct. Failing the commit would
		// trade a recoverable staleness for an unrecoverable interruption.
		const reconcile = vi.fn().mockImplementation(() => {
			throw new Error('database is locked');
		});
		const result = reconcileProjection({
			root: '/repo',
			proposalsDir: 'docs/delendai/proposals',
			reconcile,
		});
		expect(result.status).toBe('failed');
		expect(result.lines.join('\n')).toContain('database is locked');
		expect(result.lines.join('\n')).toContain('falls back');
	});
});

describe('levelProjection', () => {
	const input = {
		root: '/repo',
		indexPathAbs: '/repo/.cache/delendai/proposals/index.json',
		proposalsDir: 'docs/delendai/proposals',
	};

	it('asks the reader, and leaves a level projection alone', async () => {
		// A full reconcile costs seconds whether or not anything changed.
		const reconcile = vi.fn().mockReturnValue(output);
		const parity = vi.fn().mockResolvedValue('parity');
		const result = await levelProjection({ ...input, parity, reconcile });
		expect(parity).toHaveBeenCalledWith(input.indexPathAbs, {
			workspaceRoot: '/repo',
		});
		expect(reconcile).not.toHaveBeenCalled();
		expect(result).toEqual({ status: 'skipped', lines: [] });
	});

	it('refreshes in exactly the cases the reader would fall back', async () => {
		for (const verdict of [
			'divergence',
			'unavailable',
			'metadata-missing',
		]) {
			const reconcile = vi.fn().mockReturnValue(output);
			const result = await levelProjection({
				...input,
				parity: vi.fn().mockResolvedValue(verdict),
				reconcile,
			});
			expect(reconcile).toHaveBeenCalledTimes(1);
			expect(result.status).toBe('refreshed');
		}
	});

	it('treats a parity question it cannot answer as not level', async () => {
		const reconcile = vi.fn().mockReturnValue(output);
		const result = await levelProjection({
			...input,
			parity: vi.fn().mockRejectedValue(new Error('locked')),
			reconcile,
		});
		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(result.status).toBe('refreshed');
	});

	it('says a rejected reconcile failed, with the reconciler\u2019s reason', async () => {
		const result = await levelProjection({
			...input,
			parity: vi.fn().mockResolvedValue('divergence'),
			reconcile: vi.fn().mockReturnValue({
				...output,
				status: 'rejected',
				reason: 'foreign_key_check failed',
			}),
		});
		expect(result.status).toBe('failed');
		expect(result.lines.join('\n')).toContain('foreign_key_check failed');
	});

	it('says a rejection without a reason failed too', async () => {
		const result = await levelProjection({
			...input,
			parity: vi.fn().mockResolvedValue('divergence'),
			reconcile: vi.fn().mockReturnValue({
				...output,
				status: 'rejected',
				reason: null,
			}),
		});
		expect(result.status).toBe('failed');
		expect(result.lines.join('\n')).toContain('rejected the candidate');
	});
});
