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

	it('points each tab at the panel it controls via aria-controls (H27)', () => {
		const html = buildTabsBar(dictsByLang.en);
		// tab-${id} must control panel-${id} (the panels render with the
		// matching id in build-panels / render-panel-*).
		expect(html).toContain(
			'id="tab-overview" role="tab" aria-controls="panel-overview"',
		);
		expect(html).toContain(
			'id="tab-health" role="tab" aria-controls="panel-health"',
		);
		expect(html).toContain(
			'id="tab-docs" role="tab" aria-controls="panel-docs"',
		);
	});

	it('uses a roving tabindex: only the first tab is in the tab order (H27)', () => {
		const html = buildTabsBar(dictsByLang.en);
		// The first tab (overview) is selected → tabindex 0.
		expect(html).toContain('id="tab-overview"');
		expect(html).toMatch(
			/id="tab-overview"[^>]*aria-selected="true"[^>]*tabindex="0"/,
		);
		// Every other tab is removed from the tab order.
		expect(html).toMatch(
			/id="tab-health"[^>]*aria-selected="false"[^>]*tabindex="-1"/,
		);
		// Exactly one tab is in the tab order.
		expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
	});

	it('keeps the refresh button out of the tablist (it is an action)', () => {
		const html = buildTabsBar(dictsByLang.en);
		expect(html).toContain('id="tab-refresh" data-action="refresh"');
		expect(html).not.toMatch(/id="tab-refresh"[^>]*role="tab"/);
	});
});
