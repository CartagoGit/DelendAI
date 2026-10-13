import { describe, expect, it } from 'vitest';

import { renderHeaderBar } from '../../src/components/header-bar';

describe('renderHeaderBar', async () => {
	it('returns a <header class="delendai-header"> with the brand name and version', async () => {
		const html = renderHeaderBar({
			brandName: 'delendai',
			version: '1.0.0',
		});
		expect(html).toMatch(/<header class="delendai-header">/);
		expect(html).toContain('delendai');
		expect(html).toContain('v1.0.0');
	});

	it('includes an inline brand SVG with the MV gradient', async () => {
		const html = renderHeaderBar({
			brandName: 'delendai',
			version: '1.0.0',
		});
		expect(html).toMatch(/<svg class="delendai-header__logo"/);
		expect(html).toContain('--delendai-brand-blue');
		expect(html).toContain('--delendai-brand-purple');
	});

	it('omits the right-hand strip when no actions or langPicker are provided', async () => {
		const html = renderHeaderBar({
			brandName: 'delendai',
			version: '1.0.0',
		});
		expect(html).not.toContain('delendai-header__strip');
	});

	it('includes the right-hand strip when actions or langPicker are provided', async () => {
		const html = renderHeaderBar({
			brandName: 'delendai',
			version: '1.0.0',
			actions: '<button>Refresh</button>',
			langPicker: '<label>Lang</label>',
		});
		expect(html).toContain('delendai-header__strip');
		expect(html).toContain('Refresh');
		expect(html).toContain('Lang');
	});

	it('escapes HTML in brand name and version', async () => {
		const html = renderHeaderBar({ brandName: '<script>', version: 'a"b' });
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});
