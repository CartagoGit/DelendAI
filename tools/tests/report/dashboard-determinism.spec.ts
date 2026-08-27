import { describe, expect, it } from 'vitest';

import {
	DASHBOARD_SURFACES,
	measurePresetDashboard,
} from '../../scripts/report/token-budget-dashboard.script';
import {
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
} from '../../scripts/report/token-budget-report-lib';

describe('dashboard determinism', () => {
	it('measures the same preset+surface identically across two runs', async () => {
		const workspace = createTokenBudgetFixtureWorkspace();
		try {
			const nativeSurface = DASHBOARD_SURFACES[0];
			if (nativeSurface === undefined) {
				throw new Error('expected a native DASHBOARD_SURFACES entry');
			}
			const first = await measurePresetDashboard(
				workspace,
				'minimal',
				nativeSurface,
			);
			const second = await measurePresetDashboard(
				workspace,
				'minimal',
				nativeSurface,
			);
			expect(second.toolCount).toBe(first.toolCount);
			expect(second.toolsListBytes).toBe(first.toolsListBytes);
			expect(second.ownerRows).toEqual(first.ownerRows);
			expect(second.toolBreakdowns).toEqual(first.toolBreakdowns);
			expect(second.tokenizerEstimates).toEqual(first.tokenizerEstimates);
		} finally {
			destroyTokenBudgetFixtureWorkspace(workspace);
		}
	}, 30_000);
});
