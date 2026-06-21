/**
 * `discoverTroubleshootingCases` — pure-function catalogue scanner for
 * `docs/troubleshooting/*.md` (l030 S4). Mirrors `discover-tutorials.spec.ts`:
 * SRP lives in the module, this spec pins the contract.
 */
import { describe, expect, it } from 'vitest';

import {
	discoverTroubleshootingCases,
	type ITroubleshootingReader,
} from '../lib/discover-troubleshooting';

const fakeReader = (files: Record<string, string>): ITroubleshootingReader => {
	const dir = 'docs/troubleshooting';
	const names = Object.keys(files)
		.filter((p) => p.startsWith(`${dir}/`))
		.map((p) => p.slice(dir.length + 1));
	return {
		listFiles: () => names,
		readFile: (path) => files[path],
		join: (...parts) => parts.join('/'),
	};
};

describe('discoverTroubleshootingCases', () => {
	it('returns an empty list when the directory has no files', () => {
		const r = fakeReader({});
		expect(discoverTroubleshootingCases('docs/troubleshooting', r)).toEqual(
			[],
		);
	});

	it('parses frontmatter (slug, symptom, cause, fix, tags, closedBy) and body', () => {
		const r = fakeReader({
			'docs/troubleshooting/example-case.md': [
				'---',
				'slug: example-case',
				'symptom: "Things break."',
				'cause: "A reason."',
				'fix: "Do the thing."',
				'tags: [foo, bar]',
				'closedBy: "x00001"',
				'---',
				'',
				'Body text.',
			].join('\n'),
		});
		const out = discoverTroubleshootingCases('docs/troubleshooting', r);
		expect(out).toHaveLength(1);
		const first = out[0];
		if (!first) throw new Error('expected one case');
		expect(first.slug).toBe('example-case');
		expect(first.symptom).toBe('Things break.');
		expect(first.cause).toBe('A reason.');
		expect(first.fix).toBe('Do the thing.');
		expect(first.tags).toEqual(['foo', 'bar']);
		expect(first.closedBy).toBe('x00001');
		expect(first.body).toBe('Body text.');
	});

	it('skips a file missing any required field', () => {
		const r = fakeReader({
			'docs/troubleshooting/incomplete.md': [
				'---',
				'slug: incomplete',
				'symptom: "Only a symptom."',
				'---',
				'body',
			].join('\n'),
		});
		expect(discoverTroubleshootingCases('docs/troubleshooting', r)).toEqual(
			[],
		);
	});

	it('skips non-md files', () => {
		const r = fakeReader({
			'docs/troubleshooting/notes.txt': 'not a case',
			'docs/troubleshooting/real.md': [
				'---',
				'slug: real',
				'symptom: "s"',
				'cause: "c"',
				'fix: "f"',
				'---',
				'body',
			].join('\n'),
		});
		const out = discoverTroubleshootingCases('docs/troubleshooting', r);
		expect(out.map((c) => c.slug)).toEqual(['real']);
	});

	it('defaults tags to [] when absent', () => {
		const r = fakeReader({
			'docs/troubleshooting/no-tags.md': [
				'---',
				'slug: no-tags',
				'symptom: "s"',
				'cause: "c"',
				'fix: "f"',
				'---',
				'body',
			].join('\n'),
		});
		const out = discoverTroubleshootingCases('docs/troubleshooting', r);
		expect(out[0]?.tags).toEqual([]);
	});

	it('sorts by slug', () => {
		const r = fakeReader({
			'docs/troubleshooting/zeta.md':
				'---\nslug: zeta\nsymptom: "s"\ncause: "c"\nfix: "f"\n---\nbody',
			'docs/troubleshooting/alpha.md':
				'---\nslug: alpha\nsymptom: "s"\ncause: "c"\nfix: "f"\n---\nbody',
		});
		const out = discoverTroubleshootingCases('docs/troubleshooting', r);
		expect(out.map((c) => c.slug)).toEqual(['alpha', 'zeta']);
	});

	it('handles a file with broken frontmatter (no closing ---) by skipping it', () => {
		const r = fakeReader({
			'docs/troubleshooting/broken.md':
				'---\nslug: broken\n# no closing fence',
		});
		expect(discoverTroubleshootingCases('docs/troubleshooting', r)).toEqual(
			[],
		);
	});
});
