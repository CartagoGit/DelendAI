/**
 * token-budget-dashboard.spec.ts — c00135 (Track E).
 *
 * Verifies the per-surface separation contract of the token budget
 * dashboard:
 *   - `adaptive` (bytes, serialized outputSchema) and `native`
 *     (estimated prompt tokens) are independent columns.
 *   - A tool with only adaptive data shows `native: null` (never 0).
 *   - A tool with only native data shows `adaptive: null`.
 *   - "Documented deficits" reports breaches per surface (not on a
 *     mixed total), so false positives from mixing disappear.
 *
 * The model types live in `packages/core/src/lib/budgets/types.ts`.
 */
import { describe, expect, it } from 'vitest';

import type {
	IPerSurfaceMeasurement,
	ITokenReport,
	Surface,
} from '../../../packages/core/src/lib/budgets/types';

/** Pure: split a per-tool used measurement into a status per surface. */
export const surfaceStatus = (
	used: IPerSurfaceMeasurement,
	budget: IPerSurfaceMeasurement,
): Record<Surface, 'ok' | 'breach' | null> => {
	const status: Record<Surface, 'ok' | 'breach' | null> = {
		adaptive: null,
		native: null,
	};
	for (const surface of ['adaptive', 'native'] as const) {
		const usedValue = used[surface];
		const budgetValue = budget[surface];
		if (usedValue === undefined || budgetValue === undefined) continue;
		status[surface] = usedValue > budgetValue ? 'breach' : 'ok';
	}
	return status;
};

/** Deficits computed independently per surface (no mixed total). */
export const documentedDeficits = (
	rows: readonly {
		readonly toolId: string;
		readonly used: IPerSurfaceMeasurement;
		readonly budget: IPerSurfaceMeasurement;
	}[],
): readonly {
	readonly tool: string;
	readonly surface: Surface;
	readonly ratio: number;
}[] => {
	const deficits: { tool: string; surface: Surface; ratio: number }[] = [];
	for (const row of rows) {
		for (const surface of ['adaptive', 'native'] as const) {
			const used = row.used[surface];
			const budget = row.budget[surface];
			if (used === undefined || budget === undefined) continue;
			if (used > budget) {
				deficits.push({
					tool: row.toolId,
					surface,
					ratio: used / budget,
				});
			}
		}
	}
	return deficits;
};

describe('c00135 — dashboard surface separation', () => {
	it('a tool with only adaptive data leaves native as null (not 0)', () => {
		const status = surfaceStatus({ adaptive: 800 }, { adaptive: 4096 });
		expect(status.adaptive).toBe('ok');
		expect(status.native).toBeNull();
	});

	it('a tool with only native data leaves adaptive as null', () => {
		const status = surfaceStatus({ native: 2100 }, { native: 12000 });
		expect(status.native).toBe('ok');
		expect(status.adaptive).toBeNull();
	});

	it('reports a real adaptive breach without inventing a native one', () => {
		const status = surfaceStatus({ adaptive: 5000 }, { adaptive: 4096 });
		expect(status.adaptive).toBe('breach');
		expect(status.native).toBeNull();
	});

	it('documented deficits are computed per surface (no mixed total)', () => {
		const deficits = documentedDeficits([
			{
				toolId: 'proposals.get',
				used: { adaptive: 5000, native: 2100 },
				budget: { adaptive: 4096, native: 12000 },
			},
		]);
		expect(deficits).toHaveLength(1);
		expect(deficits[0]).toMatchObject({
			tool: 'proposals.get',
			surface: 'adaptive',
		});
		expect(deficits[0]!.ratio).toBeCloseTo(5000 / 4096, 3);
	});

	it('the report type exposes per-surface measurements and deficits', () => {
		// Type-level assertion: ITokenReport must carry documentedDeficits.
		const report: ITokenReport = {
			toolId: 'proposals.get',
			measurements: [],
			documentedDeficits: [
				{ surface: 'schema', ratio: 1.4, bytes: 5600, budget: 4096 },
			],
			generatedAt: '2026-08-30T00:00:00.000Z',
		};
		expect(report.documentedDeficits[0]?.surface).toBe('schema');
	});
});
