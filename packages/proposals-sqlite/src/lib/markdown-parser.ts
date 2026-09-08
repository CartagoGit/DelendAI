import { createHash } from 'node:crypto';

type TScalar = string | number | boolean | null;
type TYamlValue =
	| TScalar
	| readonly TYamlValue[]
	| { readonly [key: string]: TYamlValue };

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

const countIndent = (line: string): number => {
	let count = 0;
	while (count < line.length && line[count] === ' ') count += 1;
	return count;
};

const parseScalar = (raw: string): TScalar => {
	const value = raw.trim();
	if (value === '' || value === 'null') return null;
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
	return value.replace(/^['"]|['"]$/g, '');
};

const parseArray = (lines: readonly string[]): readonly TYamlValue[] =>
	lines
		.map((line) => line.trim())
		.filter((line) => line.startsWith('- '))
		.map((line) => parseScalar(line.slice(2)));

export const extractYamlBlock = (raw: string): string | null => {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? (match[1] ?? '') : null;
};

export const parseFrontmatterBlock = (
	block: string
): Readonly<Record<string, TYamlValue>> => {
	const lines = block.split('\n');
	const parsed: Record<string, TYamlValue> = {};
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (line.trim() === '' || countIndent(line) > 0) continue;
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)?$/);
		if (!match) continue;
		const key = match[1] ?? '';
		const inline = (match[2] ?? '').trim();
		if (inline === '') {
			const childLines: string[] = [];
			for (let child = index + 1; child < lines.length; child += 1) {
				const childLine = lines[child] ?? '';
				if (childLine.trim() === '') {
					childLines.push(childLine);
					continue;
				}
				if (countIndent(childLine) === 0) break;
				childLines.push(childLine);
				index = child;
			}
			parsed[key] = parseArray(childLines);
			continue;
		}
		if (inline === '[]') {
			parsed[key] = [];
			continue;
		}
		parsed[key] = parseScalar(inline);
	}
	return parsed;
};

const readTitle = (
	raw: string,
	frontmatter: Readonly<Record<string, TYamlValue>>
): string => {
	const frontmatterTitle = frontmatter.title;
	if (
		typeof frontmatterTitle === 'string' &&
		frontmatterTitle.trim() !== ''
	) {
		return frontmatterTitle.trim();
	}
	const h1 = raw.match(/^#\s+(.+)$/m);
	return (h1?.[1] ?? '').trim();
};

export const parseProposalMarkdown = (
	path: string,
	raw: string
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

const SLICES_HEADING = /^##\s+slices\s*$/i;
const H2_HEADING = /^##\s+\S/;
const SLICE_HEADING =
	/^###\s+([A-Za-z0-9][A-Za-z0-9._-]{0,31})\s*[—–-]\s*(.+?)\s*$/;
const SLICE_STATUS = /^\s*[-*]\s*\*\*status\*\*\s*:\s*(.+?)\s*$/i;

/** Lines that belong to the `## Slices` section, heading excluded. */
export const extractSlicesSection = (body: string): readonly string[] => {
	const lines = body.split('\n');
	const start = lines.findIndex((line) => SLICES_HEADING.test(line));
	if (start === -1) return [];
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => H2_HEADING.test(line));
	return end === -1 ? rest : rest.slice(0, end);
};

export const parseSliceSections = (
	body: string
): readonly IParsedSliceSection[] => {
	const sections = extractSlicesSection(body);
	const parsed: IParsedSliceSection[] = [];
	let current: { sliceId: string; title: string; status: string | null } | null =
		null;
	const flush = (): void => {
		if (current !== null) parsed.push({ ...current });
		current = null;
	};
	for (const line of sections) {
		const heading = line.match(SLICE_HEADING);
		if (heading) {
			const sliceId = heading[1] ?? '';
			const title = (heading[2] ?? '').trim();
			// A slice id always carries a number (S1, S12, F2-S1). This
			// keeps prose subheadings out of the projection.
			if (!/\d/.test(sliceId) || title === '') continue;
			flush();
			current = { sliceId, title, status: null };
			continue;
		}
		if (current === null) continue;
		const status = line.match(SLICE_STATUS);
		if (status && current.status === null) {
			current.status = (status[1] ?? '').trim();
		}
	}
	flush();
	return parsed;
};
