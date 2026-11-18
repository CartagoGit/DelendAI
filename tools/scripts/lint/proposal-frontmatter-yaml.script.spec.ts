import { describe, expect, it } from 'vitest';

import { frontmatterYamlError } from './proposal-frontmatter-yaml.script';

const withFrontmatter = (block: string): string =>
	`---\n${block}\n---\n\n# Title\n`;

describe('frontmatterYamlError', () => {
	it('accepts a YAML frontmatter, and a file without one', () => {
		expect(
			frontmatterYamlError(
				withFrontmatter('id: x00001\nshipped-in:\n  - "abc: def"'),
			),
		).toBeUndefined();
		expect(frontmatterYamlError('# no frontmatter\n')).toBeUndefined();
	});

	it.each([
		[
			'a second colon in a list item',
			'closed-evidence:\n  - S1: abc feat(x): y',
		],
		['tab indentation', 'related:\n\t- x00001'],
		['a key written twice', 'status: ready\nstatus: done'],
	])('refuses %s', (_label, block) => {
		expect(frontmatterYamlError(withFrontmatter(block))).toBeDefined();
	});
});
