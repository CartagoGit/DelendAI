import { describe, expect, it } from 'vitest';

import {
	buildSelectorGraph,
	impactOfFile,
	impactOfSelector,
	packageOf,
} from '../../../../src/lib/graph/selector-graph.service';

const graph = buildSelectorGraph({
	stylesheets: [
		{
			path: 'apps/shared/src/styles/button.scss',
			text: '.btn {\n\tcolor: red;\n\t&--primary { color: blue; }\n}\n.btn-group, .toolbar { gap: 4px; }\n',
		},
		{
			path: 'apps/web/src/styles/page.scss',
			text: '.page { margin: 0; }\n',
		},
	],
	markup: [
		{
			path: 'apps/web/src/pages/index.astro',
			text: '---\nconst x = 1;\n---\n<div class="page">\n\t<button class="btn btn--primary">Go</button>\n</div>\n<style>\n.local { color: green; }\n</style>\n',
		},
		{
			path: 'apps/shared/src/components/Bar.astro',
			text: '<nav class="toolbar"><span class="btn local">x</span></nav>\n',
		},
	],
});

describe('buildSelectorGraph', () => {
	it('reads nesting and comma lists as the integrity ratchet does', () => {
		expect([...graph.selectors.keys()]).toEqual([
			'btn',
			'btn--primary',
			'btn-group',
			'local',
			'page',
			'toolbar',
		]);
		expect(graph.selectors.get('btn--primary')?.definedIn).toEqual([
			'apps/shared/src/styles/button.scss',
		]);
	});

	it('knows a markup file defines what its own style block declares', () => {
		expect(graph.selectors.get('local')).toEqual({
			name: 'local',
			definedIn: ['apps/web/src/pages/index.astro'],
			usedBy: ['apps/shared/src/components/Bar.astro'],
		});
	});

	it('lists what each file defines', () => {
		expect(
			graph.definedBy.get('apps/shared/src/styles/button.scss'),
		).toEqual(['btn', 'btn--primary', 'btn-group', 'toolbar']);
	});
});

describe('impactOfSelector', () => {
	it('names every consuming surface, and which are in another package', () => {
		const impact = impactOfSelector(graph, '.btn');
		expect(impact?.definedIn).toEqual([
			'apps/shared/src/styles/button.scss',
		]);
		expect(impact?.consumers).toEqual([
			{
				path: 'apps/shared/src/components/Bar.astro',
				package: 'apps/shared',
				crossesBoundary: false,
			},
			{
				path: 'apps/web/src/pages/index.astro',
				package: 'apps/web',
				crossesBoundary: true,
			},
		]);
		expect(impact?.crossBoundary).toBe(1);
	});

	it('answers for a selector nobody uses, and has nothing for one that does not exist', () => {
		expect(impactOfSelector(graph, 'btn-group')?.consumers).toEqual([]);
		expect(impactOfSelector(graph, 'nope')).toBeUndefined();
	});
});

describe('impactOfFile', () => {
	it('is the impact of every selector the file defines', () => {
		const impacts = impactOfFile(
			graph,
			'apps/shared/src/styles/button.scss',
		);
		expect(impacts.map((each) => each.selector)).toEqual([
			'btn',
			'btn--primary',
			'btn-group',
			'toolbar',
		]);
		expect(impactOfFile(graph, 'nowhere.scss')).toEqual([]);
	});
});

describe('packageOf', () => {
	it('is the first two segments of the path', () => {
		expect(packageOf('apps/web/src/a.astro')).toBe('apps/web');
	});
});
