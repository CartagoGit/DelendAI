/**
 * project-kpis-interval.spec.ts — the snapshot covers the interval the
 * history is read over: it ends at `to` and counts usage over from..to.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IKpiAggregationOptions } from '../../src/lib/contracts/kpi-snapshot.interface';
import { buildKpiSnapshot } from '../../src/lib/services/kpi-aggregation.service';
import { runProjectKpis } from '../../src/lib/tools/project-kpis.tool';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

describe('project_kpis interval', () => {
	it('builds the snapshot over the from..to the history is read over', async () => {
		const root = await mkdtemp(join(tmpdir(), 'kpi-interval-'));
		roots.push(root);
		const seen: IKpiAggregationOptions[] = [];
		await runProjectKpis(
			{
				view: 'summary',
				from: '2026-08-01T00:00:00.000Z',
				to: '2026-08-04T12:00:00.000Z',
			},
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				cacheDir: '.cache/delendai',
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
				buildKpiSnapshot: async (options) => {
					seen.push(options);
					return buildKpiSnapshot(options);
				},
			},
		);
		expect(seen[0]?.now?.toISOString()).toBe('2026-08-04T12:00:00.000Z');
		expect(seen[0]?.usageSpanDays).toBe(3.5);
	});
});
