/**
 * One act refreshes both projections of the proposal markdown.
 */
import { describe, expect, it, vi } from 'vitest';

import { reconcileProjection } from '../../../../src/lib/services/projection-refresh';

const output = {
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
