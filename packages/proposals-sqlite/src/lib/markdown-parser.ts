import { createHash } from 'node:crypto';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
	type IYamlValue,
} from './frontmatter.helper';

export { extractYamlBlock, parseFrontmatterBlock } from './frontmatter.helper';

type TYamlValue = IYamlValue;

export interface IParsedProposalMarkdown {
	readonly path: string;
	readonly raw: string;
	readonly frontmatter: Readonly<Record<string, TYamlValue>>;
	readonly title: string;
	readonly body: string;
	readonly bodyHash: string;
}

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

const isSpace = (char: string): boolean => char !== '' && char.trim() === '';

/** Index of the first non-space character at or after `from`. */
const skipSpaces = (text: string, from: number): number => {
	let at = from;
	while (at < text.length && isSpace(text.charAt(at))) at += 1;
	return at;
};

const readTitle = (
	raw: string,
	frontmatter: Readonly<Record<string, TYamlValue>>,
): string => {
	const frontmatterTitle = frontmatter.title;
	if (
		typeof frontmatterTitle === 'string' &&
		frontmatterTitle.trim() !== ''
	) {
		return frontmatterTitle.trim();
	}
	for (const line of raw.split('\n')) {
		if (
			line.startsWith('#') &&
			isSpace(line.charAt(1)) &&
			line.length > 2
		) {
			return line.slice(1).trim();
		}
	}
	return '';
};

export const parseProposalMarkdown = (
	path: string,
	raw: string,
): IParsedProposalMarkdown => {
	const block = extractYamlBlock(raw);
	if (block === null) {
		throw new Error(`Missing YAML frontmatter in ${path}`);
	}
	const frontmatter = parseFrontmatterBlock(block);
	const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
	return {
		path,
		raw,
		frontmatter,
		title: readTitle(body, frontmatter),
		body,
		bodyHash: sha256(body),
	};
};

/**
 * Slice sections (x00528 S1).
 *
 * A proposal markdown may declare its execution plan under a
 * `## Slices` heading, with one `### <sliceId> — <title>` block per
 * slice and a `- **Status**: <status>` bullet inside it. The parser is
 * deliberately tolerant: anything that does not look like a slice
 * heading is ignored, and a document without a `## Slices` section
 * yields an empty list rather than an error.
 */
export interface IParsedSliceSection {
	readonly sliceId: string;
	readonly title: string;
	readonly status: string | null;
}

const MAX_SLICE_ID_LENGTH = 32;
const SLICE_ID_START = /[A-Za-z0-9]/;
const SLICE_ID_CHAR = /[A-Za-z0-9._-]/;
const DASHES = '—–-';

/** The text after a `##`-style marker and its whitespace, else null. */
const afterMarker = (line: string, marker: string): string | null => {
	if (!line.startsWith(marker) || !isSpace(line.charAt(marker.length))) {
		return null;
	}
	return line.slice(skipSpaces(line, marker.length));
};

// Linear parses instead of expressions: adjacent whitespace quantifiers
// made the old matchers quadratic on a long run of spaces.
const isSlicesHeading = (line: string): boolean =>
	afterMarker(line, '##')?.trim().toLowerCase() === 'slices';

const isH2Heading = (line: string): boolean =>
	(afterMarker(line, '##') ?? '') !== '';

const matchSliceHeading = (
	line: string,
): { readonly sliceId: string; readonly title: string } | null => {
	const rest = afterMarker(line, '###');
	if (rest === null || !SLICE_ID_START.test(rest.charAt(0))) return null;
	let idEnd = 1;
	while (
		idEnd < MAX_SLICE_ID_LENGTH &&
		SLICE_ID_CHAR.test(rest.charAt(idEnd))
	) {
		idEnd += 1;
	}
	// The id may itself hold dashes: the longest id that a dash follows.
	for (let end = idEnd; end >= 1; end -= 1) {
		const dash = skipSpaces(rest, end);
		if (!DASHES.includes(rest.charAt(dash)) || dash >= rest.length)
			continue;
		const title = rest.slice(dash + 1).trim();
		if (title !== '') return { sliceId: rest.slice(0, end), title };
	}
	return null;
};

const matchSliceStatus = (line: string): string | null => {
	const start = skipSpaces(line, 0);
	if (!'-*'.includes(line.charAt(start)) || start >= line.length) return null;
	const bold = skipSpaces(line, start + 1);
	const key = '**status**';
	if (line.slice(bold, bold + key.length).toLowerCase() !== key) return null;
	const colon = skipSpaces(line, bold + key.length);
	if (line.charAt(colon) !== ':') return null;
	const value = line.slice(colon + 1).trim();
	return value === '' ? null : value;
};

/** Lines that belong to the `## Slices` section, heading excluded. */
export const extractSlicesSection = (body: string): readonly string[] => {
	const lines = body.split('\n');
	const start = lines.findIndex((line) => isSlicesHeading(line));
	if (start === -1) return [];
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => isH2Heading(line));
	return end === -1 ? rest : rest.slice(0, end);
};

export const parseSliceSections = (
	body: string,
): readonly IParsedSliceSection[] => {
	const sections = extractSlicesSection(body);
	const parsed: IParsedSliceSection[] = [];
	let current: {
		sliceId: string;
		title: string;
		status: string | null;
	} | null = null;
	const flush = (): void => {
		if (current !== null) parsed.push({ ...current });
		current = null;
	};
	for (const line of sections) {
		const heading = matchSliceHeading(line);
		if (heading) {
			const { sliceId, title } = heading;
			// A slice id always carries a number (S1, S12, F2-S1). This
			// keeps prose subheadings out of the projection.
			if (!/\d/.test(sliceId) || title === '') continue;
			flush();
			current = { sliceId, title, status: null };
			continue;
		}
		if (current === null) continue;
		const status = matchSliceStatus(line);
		if (status !== null && current.status === null) {
			current.status = status;
		}
	}
	flush();
	return parsed;
};
