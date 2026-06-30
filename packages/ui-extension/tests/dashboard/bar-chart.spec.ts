import { describe, expect, it } from 'vitest';

import { barChart } from '../../src/dashboard/bar-chart';

describe('barChart', async () => {
	it('returns a valid SVG element', async () => {
		const html = barChart(
			[
				{ label: 'a', value: 10 },
				{ label: 'b', value: 20 },
			],
			200,
			100,
			{ ariaLabel: 'Latency histogram' },
		);
		expect(html).toMatch(/^<svg /);
		expect(html).toContain('</svg>');
	});

	it('renders one rect per datum', async () => {
		const html = barChart(
			[
				{ label: 'a', value: 10 },
				{ label: 'b', value: 20 },
				{ label: 'c', value: 30 },
			],
			300,
			100,
			{ ariaLabel: 'chart' },
		);
		expect((html.match(/<rect /g) ?? []).length).toBe(3);
	});

	it('renders nothing for empty data', async () => {
		const html = barChart([], 200, 100, { ariaLabel: 'empty' });
		expect((html.match(/<rect /g) ?? []).length).toBe(0);
		expect(html).toContain('<svg');
	});

	it('escapes XML special chars in labels', async () => {
		const html = barChart([{ label: '<x>&"', value: 1 }], 100, 60, {
			ariaLabel: 'chart',
		});
		expect(html).toContain('&lt;x&gt;&amp;&quot;');
		expect(html).not.toContain('<x>');
	});

	it('respects the explicit max option', async () => {
		const html = barChart([{ label: 'a', value: 5 }], 100, 60, {
			max: 10,
			ariaLabel: 'chart',
		});
		expect(html).toContain('<rect');
	});

	it('renders role="img" with the supplied aria-label (H24)', async () => {
		const html = barChart([{ label: 'a', value: 1 }], 100, 60, {
			ariaLabel: 'Token share by plugin',
		});
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="Token share by plugin"');
	});

	it('escapes XML special chars in the aria-label (H24)', async () => {
		const html = barChart([{ label: 'a', value: 1 }], 100, 60, {
			ariaLabel: '<bad> & "quoted"',
		});
		expect(html).toContain(
			'aria-label="&lt;bad&gt; &amp; &quot;quoted&quot;"',
		);
		expect(html).not.toContain('aria-label="<bad>');
	});
});
