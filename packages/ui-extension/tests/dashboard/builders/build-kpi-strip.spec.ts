import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { dictsByLang } from '@mcp-vertex/shared/i18n';
import { buildKpiStrip } from '../../../src/dashboard/builders/build-kpi-strip';

describe('buildKpiStrip', () => {
	it('renders all KPI totals correctly', () => {
		const mockModel = {
			overview: {
				totals: {
					tools: 10,
					plugins: 5,
					proposals: 2,
					calls: 50,
					tokens: 1000,
					tokensSaved: 200,
					savingsPercent: 20,
					totalMs: 500,
					agents: 1,
				},
			},
		} as unknown as IDashboardAllModels;

		const html = buildKpiStrip(mockModel, dictsByLang.en);
		expect(html).toContain('mv-kpis');
		expect(html).toContain('10');
		expect(html).toContain('5');
		expect(html).toContain('2');
		expect(html).toContain('50');
	});

	it('uses CSS-grid auto-fit so the strip wraps in a narrow sidebar (H26)', () => {
		const mockModel = {
			overview: { totals: {} },
		} as unknown as IDashboardAllModels;
		const html = buildKpiStrip(mockModel, dictsByLang.en);
		// The strip markup is just a `<div class="mv-kpis">` shell with
		// one `<div class="mv-kpi">` per metric. The wrapping rule
		// (`grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`)
		// lives in `dashboardCss` (see
		// `apps/shared/src/styles/dashboard/dashboard-css.ts`) so the
		// same rules govern every embedding. This test pins the
		// structural contract; the CSS contract is covered by the
		// shared SCSS lint + the visual regression on the dev preview.
		expect(html).toContain('<div class="mv-kpis">');
		expect(html).toContain('class="mv-kpi"');
		expect(html).not.toContain('<style>');
	});
});
