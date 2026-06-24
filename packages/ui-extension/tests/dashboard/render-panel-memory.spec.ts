import { describe, expect, it } from 'vitest';

import { renderPanelMemory } from '../../src/dashboard/render-panel-memory';

describe('renderPanelMemory', async () => {
	it('renders memory notes and escapes user content', async () => {
		const html = renderPanelMemory({
			notes: [
				{
					id: 'n1',
					title: '<Decision>',
					tags: ['proposal', '<tag>'],
				},
			],
			total: 1,
			offset: 0,
		});
		expect(html).toContain('panel-memory');
		expect(html).toContain('&lt;Decision&gt;');
		expect(html).toContain('&lt;tag&gt;');
		expect(html).not.toContain('<Decision>');
	});
});
