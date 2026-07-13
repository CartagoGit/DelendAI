import { describe, expect, it } from 'vitest';

import { renderDropdown } from '../../src/components/dropdown';

describe('renderDropdown', async () => {
	it('renders a trigger button with the given label', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [{ id: 'foo', label: 'Foo' }],
		});
		expect(html).toContain('mcpv-dropdown__trigger');
		expect(html).toContain('aria-haspopup="true"');
		expect(html).toContain('aria-expanded="false"');
		// Label is rendered with surrounding whitespace; assert by class.
		expect(html).toMatch(
			/mcpv-dropdown__trigger[\s\S]*More[\s\S]*mcpv-dropdown__caret/,
		);
	});

	it('renders each item as a menuitem button with data-mcpv-action', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [
				{ id: 'open-foo', label: 'Foo', icon: '📋' },
				{ id: 'open-bar', label: 'Bar' },
			],
		});
		expect(html).toContain('data-mcpv-action="open-foo"');
		expect(html).toContain('data-mcpv-action="open-bar"');
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

	it('uses an explicit `idPrefix` for trigger / menu / wrapper ids', async () => {
		const html = renderDropdown({
			id: 'ignored-when-prefix-set',
			idPrefix: 'nav-more',
			label: 'More',
			items: [{ id: 'foo', label: 'Foo' }],
		});
		expect(html).toContain('id="nav-more"');
		expect(html).toContain('id="nav-more-trigger"');
		expect(html).toContain('id="nav-more-menu"');
		expect(html).toContain('aria-controls="nav-more-menu"');
		expect(html).toContain('data-mcpv-dropdown-id="nav-more"');
		// Legacy wrapper id is dropped when an explicit prefix is set
		// (the prefix is the single source of truth for ids).
		expect(html).not.toContain('ignored-when-prefix-set');
	});

	it('uses an explicit `classPrefix` for every BEM class', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			idPrefix: 'nav-more',
			classPrefix: 'nav__more',
			label: 'More',
			items: [{ id: 'foo', label: 'Foo' }],
		});
		expect(html).toContain('class="nav__more"');
		expect(html).toContain('class="nav__more__trigger"');
		expect(html).toContain('class="nav__more__caret"');
		expect(html).toContain('class="nav__more__menu nav__more__menu--left"');
		expect(html).toContain('class="nav__more__item"');
		expect(html).toContain('class="nav__more__label"');
		// No default mcpv-dropdown class leaks through when overridden.
		expect(html).not.toContain('mcpv-dropdown__trigger');
		expect(html).not.toContain('mcpv-dropdown__menu');
		expect(html).not.toContain('mcpv-dropdown__item');
		expect(html).not.toContain('mcpv-dropdown__label');
		expect(html).not.toContain('mcpv-dropdown__caret');
	});

	it('aligns right when align is "right"', async () => {
		const html = renderDropdown({
			id: 'dd-1',
			label: 'More',
			items: [{ id: 'a', label: 'A' }],
			align: 'right',
		});
		expect(html).toContain('mcpv-dropdown__menu--right');
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
