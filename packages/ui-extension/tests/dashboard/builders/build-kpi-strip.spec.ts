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
});
