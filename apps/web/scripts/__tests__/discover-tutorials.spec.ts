/**
 * `discoverTutorials` — pure-function catalogue scanner for the docs site.
 *
 * The scanner is intentionally tiny: walk plugin × lang directories,
 * parse frontmatter, return a flat list. SRP lives in the module; this
 * spec just pins the contract so future refactors (e.g. support for
 * nested tutorial folders) cannot silently break the catalogue shape.
 */
import { describe, expect, it } from 'vitest';

import {
	discoverTutorials,
	groupByPluginLang,
	type ITutorialReader,
} from '../lib/discover-tutorials';
import { languages, type Lang } from '../../src/i18n/shared';

const realLanguages = languages.map((l) => l.code);

const fakeReader = (files: Record<string, string>): ITutorialReader => {
	const dirsByPath = new Map<string, string[]>();
	for (const path of Object.keys(files)) {
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i++) {
			const parent = parts.slice(0, i).join('/');
			const child = parts[i] ?? '';
			const list = dirsByPath.get(parent) ?? [];
			if (!list.includes(child)) list.push(child);
			dirsByPath.set(parent, list);
		}
	}
	return {
		listDirs: (path) => dirsByPath.get(path) ?? [],
		readFile: (path) => files[path],
		join: (...parts) => parts.join('/'),
	};
};

describe('discoverTutorials', () => {
	it('returns an empty list when no plugin has a tutorials/ dir', () => {
		const r = fakeReader({});
		expect(discoverTutorials('plugins', realLanguages, r)).toEqual([]);
	});

	it('parses frontmatter (title, audience, order) and body', () => {
		const r = fakeReader({
			'plugins/proposals/tutorials/en/getting-started.md': [
				'---',
				'title: Getting started',
				'plugin: proposals',
				'audience: orchestrator / agent',
				'order: 1',
				'---',
				'',
				'# Body line',
				'',
				'More body.',
			].join('\n'),
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		expect(out).toHaveLength(1);
		const first = out[0];
		if (!first) throw new Error('expected one tutorial');
		expect(first.plugin).toBe('proposals');
		expect(first.lang).toBe('en');
		expect(first.slug).toBe('getting-started');
		expect(first.title).toBe('Getting started');
		expect(first.audience).toBe('orchestrator / agent');
		expect(first.order).toBe(1);
		expect(first.body).toContain('# Body line');
		expect(first.body).toContain('More body.');
	});

	it('falls back to the filename when the file has no frontmatter', () => {
		const r = fakeReader({
			'plugins/memory/tutorials/en/raw.md':
				'Just a body, no frontmatter.',
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		expect(out).toHaveLength(1);
		const first = out[0];
		if (!first) throw new Error('expected one tutorial');
		expect(first.title).toBe('raw');
		expect(first.body).toBe('Just a body, no frontmatter.');
	});

	it('skips non-md files in the tutorials dir', () => {
		const r = fakeReader({
			'plugins/memory/tutorials/en/skip-this.txt': 'no',
			'plugins/memory/tutorials/en/keep.md':
				'---\ntitle: Keep\n---\nbody',
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		expect(out.map((t) => t.slug)).toEqual(['keep']);
	});

	it('handles a file with a broken frontmatter (no closing ---)', () => {
		const r = fakeReader({
			'plugins/rules/tutorials/en/broken.md':
				'---\ntitle: Broken\n# still body, no closing fence',
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		// The whole file becomes the body; title falls back to slug.
		expect(out[0]?.title).toBe('broken');
		expect(out[0]?.body).toContain('still body, no closing fence');
	});

	it('sorts by (plugin, lang, order, title)', () => {
		const r = fakeReader({
			'plugins/zeta/tutorials/en/b.md': '---\ntitle: B\norder: 2\n---\nb',
			'plugins/zeta/tutorials/en/a.md': '---\ntitle: A\norder: 1\n---\na',
			'plugins/alpha/tutorials/en/x.md':
				'---\ntitle: X\norder: 1\n---\nx',
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		expect(out.map((t) => `${t.plugin}/${t.slug}`)).toEqual([
			'alpha/x',
			'zeta/a',
			'zeta/b',
		]);
	});

	it('groupByPluginLang bucketing is plugin → lang → ordered list', () => {
		const r = fakeReader({
			'plugins/proposals/tutorials/en/a.md':
				'---\ntitle: A\norder: 1\n---\na',
			'plugins/proposals/tutorials/en/b.md':
				'---\ntitle: B\norder: 2\n---\nb',
			'plugins/proposals/tutorials/es/c.md':
				'---\ntitle: C\norder: 1\n---\nc',
		});
		const all = discoverTutorials('plugins', realLanguages, r);
		const grouped = groupByPluginLang(all);
		const en = grouped.get('proposals')?.get('en' as Lang);
		const es = grouped.get('proposals')?.get('es' as Lang);
		expect(en?.map((t) => t.slug)).toEqual(['a', 'b']);
		expect(es?.map((t) => t.slug)).toEqual(['c']);
	});

	it('numeric order fallback (alphabetical) when order is missing', () => {
		const r = fakeReader({
			'plugins/proposals/tutorials/en/zeta.md': '---\ntitle: Z\n---\nz',
			'plugins/proposals/tutorials/en/alpha.md': '---\ntitle: A\n---\na',
		});
		const out = discoverTutorials('plugins', realLanguages, r);
		expect(out.map((t) => t.slug)).toEqual(['alpha', 'zeta']);
	});
});
