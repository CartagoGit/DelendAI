import { describe, expect, it } from 'vitest';
import { dictsByLang } from '@mcp-vertex/shared/i18n';
import { buildTabsBar } from '../../../src/dashboard/builders/build-tabs-bar';

describe('buildTabsBar', () => {
	it('renders tabs bar template correctly', () => {
		const html = buildTabsBar(dictsByLang.en);
		expect(html).toContain('mv-tabs');
		expect(html).toContain('tab-overview');
		expect(html).toContain('tab-health');
		expect(html).toContain('tab-docs');
		expect(html).toContain('tab-refresh');
	});
});
