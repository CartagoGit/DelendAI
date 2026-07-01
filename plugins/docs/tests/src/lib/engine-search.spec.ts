/**
 * engine-search.spec.ts (f00028 S3)
 *
 * docs_search — ranked free-text search over the same catalogue docs_list
 * uses, with title hits weighted 3x over body hits.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchDocs } from '@mcp-vertex/docs/lib/services/engine';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('searchDocs (f00028 S3)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-search-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('ranks a title hit above a body-only hit', async () => {
		write(root, 'docs/widgets.md', '# Widgets\n\nAll about widgets.\n');
		write(
			root,
			'docs/other.md',
			'# Other\n\nThis mentions widgets once in the body.\n',
		);
		const { hits } = await searchDocs(root, 'widgets');
		expect(hits.map((h) => h.path)).toEqual([
			'docs/widgets.md',
			'docs/other.md',
		]);
		expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
	});

	it('finds a body-only hit when the title does not match', async () => {
		write(
			root,
			'docs/gadgets.md',
			'# Gadgets\n\nDetails about a particular gizmo live here.\n',
		);
		const { hits } = await searchDocs(root, 'gizmo');
		expect(hits).toHaveLength(1);
		expect(hits[0]!.path).toBe('docs/gadgets.md');
		expect(hits[0]!.snippet).toContain('gizmo');
	});

	it('returns no hits for an empty query', async () => {
		write(root, 'docs/a.md', '# A\n\nbody\n');
		const { hits } = await searchDocs(root, '');
		expect(hits).toEqual([]);
	});

	it('returns no hits when nothing matches', async () => {
		write(root, 'docs/a.md', '# A\n\nbody\n');
		const { hits } = await searchDocs(root, 'nonexistent-term-xyz');
		expect(hits).toEqual([]);
	});

	it('respects the limit cap', async () => {
		for (let i = 0; i < 5; i += 1) {
			write(
				root,
				`docs/d${i}.md`,
				`# Doc ${i}\n\nshared keyword here.\n`,
			);
		}
		const { hits } = await searchDocs(root, 'shared', { limit: 2 });
		expect(hits).toHaveLength(2);
	});

	it('produces a snippet capped at 200 chars around the first match', async () => {
		const padding = 'x'.repeat(300);
		write(root, 'docs/long.md', `# Long\n\n${padding} needle ${padding}\n`);
		const { hits } = await searchDocs(root, 'needle');
		expect(hits).toHaveLength(1);
		expect(hits[0]!.snippet.length).toBeLessThanOrEqual(200);
		expect(hits[0]!.snippet).toContain('needle');
	});
});
