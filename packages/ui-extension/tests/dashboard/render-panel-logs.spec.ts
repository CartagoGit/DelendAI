import { describe, expect, it } from 'vitest';

import { dictsByLang } from '@mcp-vertex/shared/i18n';

import { renderPanelLogs } from '../../src/dashboard/render-panel-logs';

describe('renderPanelLogs', () => {
	it('renders the panel shell + source selector', () => {
		const html = renderPanelLogs(dictsByLang.en);
		expect(html).toContain('panel-logs');
		expect(html).toContain('mcpv-logs__list');
		expect(html).toContain('name="source"');
		expect(html).toContain('value="host"');
		expect(html).toContain('value="server"');
		expect(html).toContain('value="notifications"');
		expect(html).toContain('value="errors"');
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
		expect(html).toContain('mcpv-logs__empty');
	});
});
