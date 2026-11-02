import { describe, expect, it } from 'vitest';

import { checkLinks } from '@delendai/link-check/public';

import { knownPaths, rootDocs } from './doc-links.script';

describe('doc-links', () => {
	it('owns the root documents and not the proposals', () => {
		expect(
			rootDocs([
				'README.md',
				'docs/PRIVACY.md',
				'docs/delendai/ARCHITECTURE.md',
				'docs/delendai/proposals/ready/x1.md',
				'src/a.ts',
			]),
		).toEqual([
			'README.md',
			'docs/PRIVACY.md',
			'docs/delendai/ARCHITECTURE.md',
		]);
	});

	it('fails a link to a file that is not tracked, and passes one that is', () => {
		const known = knownPaths(['docs/a.md', 'src/b.ts']);
		expect(known.has('src')).toBe(true);
		const findings = checkLinks(
			[
				{
					path: 'docs/a.md',
					content: '[ok](../src/b.ts) [gone](../src/c.ts)',
				},
			],
			known,
		);
		expect(findings.map((finding) => finding.ruleId)).toEqual([
			'broken-link',
		]);
	});
});
