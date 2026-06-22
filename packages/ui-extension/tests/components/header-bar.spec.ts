import { describe, expect, it } from 'vitest';

import { renderHeaderBar } from '../../src/components/header-bar';

describe('renderHeaderBar', () => {
	it('returns a <header class="mv-header"> with the brand name and version', () => {
		const html = renderHeaderBar({
			brandName: 'mcp-vertex',
			version: '1.0.0',
		});
		expect(html).toMatch(/<header class="mv-header">/);
		expect(html).toContain('mcp-vertex');
		expect(html).toContain('v1.0.0');
	});

	it('includes an inline brand SVG with the MV gradient', () => {
		const html = renderHeaderBar({
			brandName: 'mcp-vertex',
			version: '1.0.0',
		});
		expect(html).toMatch(/<svg class="mv-header__logo"/);
		expect(html).toContain('--mv-brand-blue');
		expect(html).toContain('--mv-brand-purple');
	});

	it('omits the right-hand strip when no actions or langPicker are provided', () => {
		const html = renderHeaderBar({
			brandName: 'mcp-vertex',
			version: '1.0.0',
		});
		expect(html).not.toContain('mv-header__strip');
	});

	it('includes the right-hand strip when actions or langPicker are provided', () => {
		const html = renderHeaderBar({
			brandName: 'mcp-vertex',
			version: '1.0.0',
			actions: '<button>Refresh</button>',
			langPicker: '<label>Lang</label>',
		});
		expect(html).toContain('mv-header__strip');
		expect(html).toContain('Refresh');
		expect(html).toContain('Lang');
	});

	it('escapes HTML in brand name and version', () => {
		const html = renderHeaderBar({ brandName: '<script>', version: 'a"b' });
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});
