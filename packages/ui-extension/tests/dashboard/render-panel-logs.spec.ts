import { describe, expect, it } from 'vitest';

import { dictsByLang } from '@delendai/shared/i18n';

import { renderPanelLogs } from '../../src/dashboard/render-panel-logs';

describe('renderPanelLogs', () => {
	it('renders the panel shell + source chip bar', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('panel-logs');
		expect(html).toContain('delendai-logs__list');
		expect(html).toContain('delendai-logs__source-bar');
		expect(html).toContain('data-source="host"');
		expect(html).toContain('data-source="server"');
		expect(html).toContain('data-source="notifications"');
		expect(html).toContain('data-source="errors"');
		expect(html).toContain('data-source="all"');
	});

	it('marks the `all` source chip as pressed by default', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('data-source="all" aria-pressed="true"');
	});

	it('renders the realtime toggle, refresh and clear buttons', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('data-logs-action="toggle-live"');
		expect(html).toContain('data-logs-action="refresh"');
		expect(html).toContain('data-logs-action="clear"');
	});

	it('renders outcome filter options for every ILogOutcome', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('value="ok"');
		expect(html).toContain('value="failed"');
		expect(html).toContain('value="timed-out"');
		expect(html).toContain('value="cancelled"');
		expect(html).toContain('value="dead"');
		expect(html).toContain('value="idle"');
		expect(html).toContain('value="unknown"');
	});

	it('renders the empty placeholder', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('delendai-logs__empty');
	});

	it('renders the detail overlay shell', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('delendai-logs__detail');
		expect(html).toContain('data-logs-action="close-detail"');
	});
});
