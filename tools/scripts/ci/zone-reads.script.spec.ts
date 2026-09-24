/**
 * zone-reads.script.spec.ts — the committed read map keeps only what
 * exists, sorted, so regenerating it is deterministic.
 */
import { describe, expect, it } from 'vitest';

import { buildZoneReadMap } from './zone-reads.script';

const KINDS: Record<string, 'file' | 'dir'> = {
	'docs/a.md': 'file',
	'docs/b.md': 'file',
	docs: 'dir',
};
const kindOf = (path: string) => KINDS[path];

describe('buildZoneReadMap', () => {
	it('keeps the directory a file was read in, apart from listed ones', () => {
		const map = buildZoneReadMap(
			{ core: ['docs/b.md', 'docs', 'docs/a.md', 'guide/c.md'] },
			(path) => (path === 'guide/c.md' ? 'file' : kindOf(path)),
		);
		expect(map.zones.core).toEqual({
			readIn: ['docs', 'guide'],
			listed: ['docs'],
		});
	});

	it('drops paths the resolver only probed, which never existed', () => {
		const map = buildZoneReadMap({ core: ['zod.ts', 'docs/a.md'] }, kindOf);
		expect(map.zones.core?.readIn).toEqual(['docs']);
	});

	it('orders the zones so the file does not churn between runs', () => {
		const map = buildZoneReadMap({ tools: [], apps: [], core: [] }, kindOf);
		expect(Object.keys(map.zones)).toEqual(['apps', 'core', 'tools']);
	});
});
