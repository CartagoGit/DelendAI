import { describe, expect, it } from 'vitest';

import { renderDropdown } from '../../src/components/dropdown';

describe('renderDropdown', async () => {
	it('renders a trigger button with the given label', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [{ id: 'foo', label: 'Foo' }],
		});
		expect(html).toContain('mv-dropdown__trigger');
		expect(html).toContain('aria-haspopup="true"');
		expect(html).toContain('aria-expanded="false"');
		// Label is rendered with surrounding whitespace; assert by class.
		expect(html).toMatch(
			/mv-dropdown__trigger[\s\S]*More[\s\S]*mv-dropdown__caret/,
		);
	});

	it('renders each item as a menuitem button with data-mv-action', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [
				{ id: 'open-foo', label: 'Foo', icon: '📋' },
				{ id: 'open-bar', label: 'Bar' },
			],
		});
		expect(html).toContain('data-mv-action="open-foo"');
		expect(html).toContain('data-mv-action="open-bar"');
		expect(html).toContain('>Foo<');
		expect(html).toContain('>Bar<');
		expect(html).toContain('📋');
	});

	it('starts with the menu hidden', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [{ id: 'foo', label: 'Foo' }],
		});
		expect(html).toContain('hidden');
	});

	it('uses the menu id `<id>-menu`', async () => {
		const html = renderDropdown({
			id: 'my-dd',
			label: 'L',
			items: [{ id: 'a', label: 'A' }],
		});
		expect(html).toContain('id="my-dd-menu"');
	});

	it('aligns right when align is "right"', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [{ id: 'a', label: 'A' }],
			align: 'right',
		});
		expect(html).toContain('mv-dropdown__menu--right');
	});

	it('escapes user-supplied labels', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: '<script>',
			items: [{ id: 'a', label: '"A"' }],
		});
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});
