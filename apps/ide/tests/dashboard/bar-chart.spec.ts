import { describe, expect, it } from 'vitest';

import { barChart } from '../../src/dashboard/bar-chart';

describe('barChart', () => {
	it('returns a valid SVG element', () => {
		const html = barChart(
			[
				{ label: 'a', value: 10 },
				{ label: 'b', value: 20 },
			],
			200,
			100,
		);
		expect(html).toMatch(/^<svg /);
		expect(html).toContain('</svg>');
	});

	it('renders one rect per datum', () => {
		const html = barChart(
			[
				{ label: 'a', value: 10 },
				{ label: 'b', value: 20 },
				{ label: 'c', value: 30 },
			],
			300,
			100,
		);
		expect((html.match(/<rect /g) ?? []).length).toBe(3);
	});

	it('renders nothing for empty data', () => {
		const html = barChart([], 200, 100);
		expect((html.match(/<rect /g) ?? []).length).toBe(0);
		expect(html).toContain('<svg');
	});

	it('escapes XML special chars in labels', () => {
		const html = barChart([{ label: '<x>&"', value: 1 }], 100, 60);
		expect(html).toContain('&lt;x&gt;&amp;&quot;');
		expect(html).not.toContain('<x>');
	});

	it('respects the explicit max option', () => {
		const html = barChart([{ label: 'a', value: 5 }], 100, 60, { max: 10 });
		expect(html).toContain('<rect');
	});
});
