import { describe, expect, it } from 'vitest';

import {
	extractContentFindings,
	stripNonMarkup,
} from './content-integrity.script';

describe('content-integrity', () => {
	it('finds static visible text and accessibility attributes', () => {
		const findings = extractContentFindings({
			path: 'apps/web/src/components/Example.astro',
			text: '<button aria-label="Refresh">Save changes</button>',
		});
		expect(
			findings.map(({ kind, literal }) => ({ kind, literal })),
		).toEqual([
			{ kind: 'attribute', literal: 'Refresh' },
			{ kind: 'text', literal: 'Save changes' },
		]);
	});

	it('ignores translated expressions, code samples and symbols', () => {
		expect(
			extractContentFindings({
				path: 'apps/web/src/components/Example.astro',
				text: '<button aria-label={t.close}>{t.save}</button><code>bun run site</code><span>×</span>',
			}),
		).toEqual([]);
	});

	it('strips code-bearing regions while retaining line numbers', () => {
		const source = `---\nconst label = 'Wrong';\n---\n<script>node.textContent = 'Wrong';</script>\n<style>.x { content: 'Wrong'; }</style>\n<p>Visible</p>`;
		expect(stripNonMarkup(source, true).split('\n')).toHaveLength(
			source.split('\n').length,
		);
		expect(
			extractContentFindings({
				path: 'apps/web/src/components/Example.astro',
				text: source,
			}),
		).toEqual([
			{
				file: 'apps/web/src/components/Example.astro',
				line: 6,
				kind: 'text',
				literal: 'Visible',
			},
		]);
	});
});
