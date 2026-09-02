import { describe, expect, it } from 'vitest';

import {
	announceManagedLazyDemotion,
	buildManagedLazyDemotionNotice,
} from '../../../../src/lib/plugins/managed-lazy-demotion';

const indexed = new Set(['git', 'search']);
const isIndexed = (specifier: string): boolean =>
	indexed.has(specifier.replace('@mcp-vertex/', ''));

describe('buildManagedLazyDemotionNotice', () => {
	it('says nothing when every plugin is indexed', () => {
		expect(
			buildManagedLazyDemotionNotice({
				effectivePlugins: ['git', '@mcp-vertex/search'],
				isIndexed,
			}).lines,
		).toEqual([]);
	});

	it('names the plugins that cost everyone lazy loading', () => {
		// The lazy route is all-or-nothing, so ONE unindexed plugin
		// demotes the whole surface. Without naming it, the regression
		// reads as "the server just got slower".
		const notice = buildManagedLazyDemotionNotice({
			effectivePlugins: ['git', 'browser', 'cache'],
			isIndexed,
		});
		expect(notice.unindexed).toEqual(['browser', 'cache']);
		expect(notice.lines[0]).toContain('browser, cache');
		expect(notice.lines[0]).toContain('eager');
	});

	it('states the cost and the one command that fixes it', () => {
		const text = buildManagedLazyDemotionNotice({
			effectivePlugins: ['browser'],
			isIndexed,
		}).lines.join('\n');
		expect(text).toContain('Every tool still works');
		expect(text).toContain('managed-lazy-catalog.script.ts');
	});
});

describe('announceManagedLazyDemotion', () => {
	it('never throws when the writer does', () => {
		expect(() =>
			announceManagedLazyDemotion(
				buildManagedLazyDemotionNotice({
					effectivePlugins: ['browser'],
					isIndexed,
				}),
				() => {
					throw new Error('stderr is closed');
				},
			),
		).not.toThrow();
	});
});
