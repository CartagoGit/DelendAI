import { describe, expect, it } from 'vitest';

import { renderDisclosure } from '../../src/components/disclosure';

describe('renderDisclosure', async () => {
	it('renders a <details> with a <summary> and the given label', async () => {
		const html = renderDisclosure({ summary: 'Settings' });
		expect(html).toMatch(/<details class="mv-disclosure"/);
		expect(html).toContain('<summary class="mv-disclosure__summary">');
		expect(html).toContain('Settings');
	});

	it('starts closed by default', async () => {
		const html = renderDisclosure({ summary: 'S' });
		expect(html).not.toContain(' open');
	});

	it('starts open when defaultOpen is true', async () => {
		const html = renderDisclosure({ summary: 'S', defaultOpen: true });
		expect(html).toContain(' open');
	});

	it('uses the given id when provided', async () => {
		const html = renderDisclosure({ summary: 'S', id: 'settings-section' });
		expect(html).toContain('id="settings-section"');
	});

	it('includes a body slot with data-mv-disclosure-body', async () => {
		const html = renderDisclosure({ summary: 'S' });
		expect(html).toContain('data-mv-disclosure-body');
	});

	it('escapes the summary', async () => {
		const html = renderDisclosure({ summary: '<b>X</b>' });
		expect(html).not.toContain('<b>X</b>');
		expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
	});
});
