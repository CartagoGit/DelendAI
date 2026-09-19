/**
 * x00552 — the tracked file is read from the workspace, and a file that
 * cannot be read resolves nothing instead of failing the boot.
 */
import { describe, expect, it } from 'vitest';

import { createRepairResolutionsSeam } from '../../../../src/lib/startup-gate/repair-resolutions-seam';
import { repairResolutionsPath } from '../../../../src/lib/startup-gate/repair-resolutions-seam';
import { REPAIR_RESOLUTIONS_PATH } from '../../../../src/lib/startup-reconciler/index';

const enoent = (): Promise<string> => {
	const error: NodeJS.ErrnoException = new Error('no such file');
	error.code = 'ENOENT';
	return Promise.reject(error);
};

describe('repair resolutions seam (x00552)', () => {
	it('resolves the tracked path under the workspace', () => {
		expect(repairResolutionsPath('/ws')).toBe(
			`/ws/${REPAIR_RESOLUTIONS_PATH}`,
		);
	});

	it('treats an absent file as "no decision was taken"', async () => {
		const seam = await createRepairResolutionsSeam({
			workspaceRoot: '/ws',
			read: enoent,
		});
		expect(seam.source.read()).toEqual([]);
		expect(seam.errors).toEqual([]);
	});

	it('reports an unreadable file instead of swallowing it', async () => {
		const seam = await createRepairResolutionsSeam({
			workspaceRoot: '/ws',
			read: () => Promise.reject(new Error('permission denied')),
		});
		expect(seam.source.read()).toEqual([]);
		expect(seam.errors[0]).toContain('permission denied');
	});

	it('reads recorded decisions', async () => {
		const entry = {
			taskId: 'task',
			evidenceDigest: 'digest',
			decision: 'accepted-loss',
			reason: 'discarded deliberately',
			decidedBy: 'cartago',
			decidedAt: '2026-09-19T08:00:00.000Z',
		};
		const seam = await createRepairResolutionsSeam({
			workspaceRoot: '/ws',
			read: () =>
				Promise.resolve(
					JSON.stringify({ version: 1, resolutions: [entry] }),
				),
		});
		expect(seam.source.read()).toEqual([entry]);
		expect(seam.errors).toEqual([]);
	});

	it('honours nothing from a malformed file and says why', async () => {
		const seam = await createRepairResolutionsSeam({
			workspaceRoot: '/ws',
			read: () => Promise.resolve('{ not json'),
		});
		expect(seam.source.read()).toEqual([]);
		expect(seam.errors).toHaveLength(1);
	});
});
