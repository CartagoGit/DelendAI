import { describe, expect, it } from 'vitest';

import { renderDisclosure } from '../../src/components/disclosure';

describe('renderDisclosure', () => {
	it('renders a <details> with a <summary> and the given label', () => {
		const html = renderDisclosure({ summary: 'Settings' });
		expect(html).toMatch(/<details class="mv-disclosure"/);
		expect(html).toContain('<summary class="mv-disclosure__summary">');
		expect(html).toContain('Settings');
	});

	it('starts closed by default', () => {
		const html = renderDisclosure({ summary: 'S' });
		expect(html).not.toContain(' open');
	});

	it('starts open when defaultOpen is true', () => {
		const html = renderDisclosure({ summary: 'S', defaultOpen: true });
		expect(html).toContain(' open');
	});

	it('uses the given id when provided', () => {
		const html = renderDisclosure({ summary: 'S', id: 'settings-section' });
		expect(html).toContain('id="settings-section"');
	});

	it('includes a body slot with data-mv-disclosure-body', () => {
		const html = renderDisclosure({ summary: 'S' });
		expect(html).toContain('data-mv-disclosure-body');
	});

	it('escapes the summary', () => {
		const html = renderDisclosure({ summary: '<b>X</b>' });
		expect(html).not.toContain('<b>X</b>');
		expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
	});
});
