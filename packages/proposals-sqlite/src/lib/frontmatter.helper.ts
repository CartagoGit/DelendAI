/**
 * frontmatter.ts — proposal frontmatter, parsed once, as YAML (r00643).
 *
 * The proposals plugin and the database reconciler each parsed
 * frontmatter by hand, differently, and both differently from YAML: on
 * the 1,019 proposals of this repository they disagreed on 161 files for
 * `shipped-in` alone, one kept YAML comments inside values, and both
 * turned flow maps into nothing. So the registry and the database could
 * not agree by construction. This is now the one reader, on a real YAML
 * parser with the core schema (no implicit dates or octal: a value that
 * looks like `2026-09-25` stays the string it is written as).
 *
 * A block YAML refuses is read by the tolerant parser it replaced, and
 * the refusal is returned with it: the proposals lint refuses such a
 * block outside the frozen `legacy/` folder, where it cannot be repaired.
 */
import { parse } from 'yaml';

import type {
	IParsedFrontmatter,
	IYamlValue,
} from './contracts/interfaces/frontmatter.interface';
import { parseLooseFrontmatter } from './frontmatter-loose.helper';

export type {
	IParsedFrontmatter,
	IYamlValue,
} from './contracts/interfaces/frontmatter.interface';

const isMapping = (value: unknown): value is Record<string, IYamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse a frontmatter block (the text between the `---` lines). */
export const parseProposalFrontmatter = (block: string): IParsedFrontmatter => {
	try {
		const value: unknown = parse(block, { schema: 'core' });
		if (value === null || value === undefined) return { value: {} };
		if (isMapping(value)) return { value };
		return {
			value: parseLooseFrontmatter(block),
			error: 'the frontmatter is not a mapping',
		};
	} catch (error) {
		return {
			value: parseLooseFrontmatter(block),
			error:
				error instanceof Error
					? (error.message.split('\n')[0] ?? error.message)
					: String(error),
		};
	}
};

/** The parsed values alone. */
export const parseFrontmatterBlock = (
	block: string,
): Readonly<Record<string, IYamlValue>> =>
	parseProposalFrontmatter(block).value;

/**
 * The frontmatter block of a markdown file: the text between the first
 * pair of `---` lines, or `null` when the file does not start with one.
 */
export const extractYamlBlock = (raw: string): string | null => {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? (match[1] ?? '') : null;
};
