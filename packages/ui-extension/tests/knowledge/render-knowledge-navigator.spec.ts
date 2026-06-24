import { describe, expect, it } from 'vitest';

import { renderKnowledgeNavigator } from '../../src/knowledge/render-knowledge-navigator';

const categories = {
	proposals: [
		{ id: 'proposals_state_machine', title: 'Proposal state machine' },
		{ id: 'proposals_lifecycle', title: 'Proposal lifecycle' },
	],
	'mcp-vertex': [
		{ id: 'mcp-vertex_overview', title: 'Overview' },
		{ id: 'mcp-vertex_metrics', title: 'Metrics' },
	],
};

describe('renderKnowledgeNavigator', async () => {
	it('renders a category for every key', async () => {
		const html = renderKnowledgeNavigator({
			categories,
			onOpenEntry: 'mcp-vertex.openKnowledgeEntry',
			onSearch: 'mcp-vertex.searchKnowledge',
		});
		expect(html).toContain('data-category="proposals"');
		expect(html).toContain('data-category="mcp-vertex"');
		// Entries are listed in sorted order (mcp-vertex < proposals).
		const mcpIx = html.indexOf('data-category="mcp-vertex"');
		const propIx = html.indexOf('data-category="proposals"');
		expect(mcpIx).toBeLessThan(propIx);
	});

	it('escapes user-provided strings (no XSS)', async () => {
		const evil = renderKnowledgeNavigator({
			categories: {
				'<script>alert(1)</script>': [
					{ id: 'evil_id', title: '<img onerror=alert(1)>' },
				],
			},
			onOpenEntry: 'cmd',
			onSearch: 'cmd',
		});
		expect(evil).not.toContain('<script>alert(1)</script>');
		expect(evil).toContain('&lt;script&gt;');
	});

	it('shows a count badge per category', async () => {
		const html = renderKnowledgeNavigator({
			categories,
			onOpenEntry: 'cmd',
			onSearch: 'cmd',
		});
		expect(html).toContain('<span class="mv-kn-count">2</span>');
	});

	it('renders a preview pane, even when empty', async () => {
		const empty = renderKnowledgeNavigator({
			categories: {},
			onOpenEntry: 'cmd',
			onSearch: 'cmd',
		});
		expect(empty).toContain('mv-kn-preview--empty');
		expect(empty).toContain('Select an entry');

		const previewed = renderKnowledgeNavigator({
			categories: { p: [{ id: 'p_x', title: 'X' }] },
			onOpenEntry: 'cmd',
			onSearch: 'cmd',
			preview: {
				id: 'p_x',
				title: 'X',
				body: 'Multi\nline\nbody',
			},
		});
		expect(previewed).toContain('Multi');
		expect(previewed).toContain('line');
	});
});
