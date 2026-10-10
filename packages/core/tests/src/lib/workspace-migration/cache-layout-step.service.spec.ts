import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	cacheLayoutOutcomes,
	runCacheLayoutStep,
} from '@delendai/core/lib/workspace-migration/cache-layout-step.service';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const workspaces: string[] = [];

afterEach(() => {
	for (const root of workspaces.splice(0)) removeTestWorkspace(root);
});

describe('runCacheLayoutStep', () => {
	it('leaves a clean adopted workspace byte-identical', async () => {
		const root = createTestWorkspace('delendai-step-');
		workspaces.push(root);
		await writeFile(join(root, 'delendai.config.json'), '{}', 'utf8');
		expect(await runCacheLayoutStep(root, false)).toEqual({
			status: 'current',
		});
		expect(await readdir(root)).toEqual(['delendai.config.json']);
	});
});

describe('cacheLayoutOutcomes', () => {
	it('reports nothing for a workspace that is current or has no history', () => {
		expect(cacheLayoutOutcomes({ status: 'current' })).toEqual([]);
		expect(cacheLayoutOutcomes({ status: 'unregistered' })).toEqual([]);
	});

	it('speaks the identity engine vocabulary', () => {
		const step = {
			id: 'cacheLayout:0-1',
			fromEpoch: 0,
			toEpoch: 1,
			steps: [{ kind: 'move', detail: 'x' }],
		};
		expect(
			cacheLayoutOutcomes({
				status: 'migrated',
				fromEpoch: 0,
				toEpoch: 1,
				applied: [step],
			}),
		).toEqual([{ status: 'migrated', id: 'cacheLayout:0-1' }]);
		expect(
			cacheLayoutOutcomes({
				status: 'planned',
				fromEpoch: 0,
				toEpoch: 1,
				pending: [step],
			}),
		).toEqual([
			{ status: 'planned', id: 'cacheLayout:0-1', steps: step.steps },
		]);
		expect(
			cacheLayoutOutcomes({
				status: 'failed',
				id: 'cacheLayout:0-1',
				reason: 'boom',
			}),
		).toEqual([
			{ status: 'failed', id: 'cacheLayout:0-1', reason: 'boom' },
		]);
	});
});
