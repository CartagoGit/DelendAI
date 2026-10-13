import { describe, expect, it } from 'vitest';

import { dictsByLang } from '@delendai/shared/i18n';

import { renderPanelHelp } from '../../src/dashboard/render-panel-help';

describe('renderPanelHelp', () => {
	it('renders the panel shell + lead text', () => {
		const html = renderPanelHelp(dictsByLang.en);
		expect(html).toContain('panel-help');
		expect(html).toContain('delendai-help');
	});

	it('lists every primary panel as a help entry', () => {
		const html = renderPanelHelp(dictsByLang.en);
		for (const tab of [
			'Status',
			'Overview',
			'Logs',
			'Metrics',
			'Tokens',
			'Spend',
			'Tools',
			'Plugins',
			'Sessions',
			'Times',
			'Agents',
			'Memory',
			'Health',
			'Settings',
		]) {
			expect(html).toContain(`<strong>${tab}</strong>`);
		}
	});

	it('includes a tip for every entry', () => {
		const html = renderPanelHelp(dictsByLang.en);
		const matches = html.match(/<p>/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(14);
	});

	it('uses details/summary for collapsibility', () => {
		const html = renderPanelHelp(dictsByLang.en);
		expect(html).toContain('<details');
		expect(html).toContain('<summary>');
	});
});
