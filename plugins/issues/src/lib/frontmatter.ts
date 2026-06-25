/**
 * Pure YAML frontmatter serializer/deserializer for the `issues` plugin's
 * scaffold files (`docs/mcp-vertex/proposals/retired/issues/github#<n>-<slug>.md`).
 *
 * Single Responsibility: this module only knows how to turn an
 * `IIssueScaffoldFrontmatter` into a `---`-fenced YAML block and back. It
 * has no opinion about file paths, GitHub tiers, or markdown bodies — that
 * belongs to `issue-scaffold.ts`, which composes this primitive.
 *
 * `plugins/proposals/src/lib/proposals/frontmatter-parser.ts` implements a
 * very similar "YAML subset" parser, but it is not re-exported from that
 * plugin's `src/public/index.ts` and no plugin in this repo declares a
 * package-level dependency on `@mcp-vertex/proposals` (the proposals
 * `dependsOn` relationship is a plugin-loader/runtime contract, not a
 * build-time import graph — see AGENTS.md: "no plugin may depend on
 * another plugin's filesystem/module internals"). Importing across
 * plugin `src` boundaries would also break each plugin's independent
 * build. So this is a small, deliberately scoped re-implementation: only
 * the handful of shapes the issues frontmatter actually needs (scalars,
 * one inline-or-block string array, one block array of comment objects),
 * not a general-purpose YAML subset parser.
 */

import type {
	IGithubComment,
	IIssueScaffoldFrontmatter,
} from './contracts/issue.types';

const FRONTMATTER_FENCE = '---';

/** Quote a YAML scalar string only when needed (colon, hash, leading/trailing space, or empty). */
const quoteIfNeeded = (value: string): string => {
	if (value === '') return "''";
	const needsQuoting =
		/[:#]/.test(value) ||
		value !== value.trim() ||
		/^['"]/.test(value) ||
		/^(true|false|null|~)$/i.test(value) ||
		!Number.isNaN(Number(value));
	if (!needsQuoting) return value;
	return `'${value.replace(/'/g, "''")}'`;
};

const yamlScalar = (value: string | number): string =>
	typeof value === 'number' ? String(value) : quoteIfNeeded(value);

/** Strip surrounding quotes (single or double) from a raw YAML scalar token. */
const unquote = (raw: string): string => {
	const v = raw.trim();
	if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
		return v.slice(1, -1).replace(/''/g, "'");
	}
	if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
		return v.slice(1, -1);
	}
	return v;
};

const indentLines = (lines: readonly string[], depth: number): string[] =>
	lines.map((l) => `${'  '.repeat(depth)}${l}`);

/**
 * Serializes an `IIssueScaffoldFrontmatter` into the YAML block content
 * (without the surrounding `---` fences — callers wrap it, see
 * `serializeFrontmatterBlock`).
 */
export const buildFrontmatterLines = (
	frontmatter: IIssueScaffoldFrontmatter,
): string[] => {
	const lines: string[] = [];

	lines.push(`source: ${yamlScalar(frontmatter.source)}`);
	lines.push(`source_id: ${yamlScalar(frontmatter.source_id)}`);
	lines.push(`source_url: ${yamlScalar(frontmatter.source_url)}`);
	lines.push(`source_author: ${yamlScalar(frontmatter.source_author)}`);
	lines.push(`ingested_at: ${yamlScalar(frontmatter.ingested_at)}`);
	lines.push(`status: ${yamlScalar(frontmatter.status)}`);
	lines.push(`resolution: ${yamlScalar(frontmatter.resolution)}`);

	if (frontmatter.proposals.length === 0) {
		lines.push('proposals: []');
	} else {
		lines.push('proposals:');
		for (const id of frontmatter.proposals) {
			lines.push(`  - ${yamlScalar(id)}`);
		}
	}

	if (frontmatter.dismiss_reason !== undefined) {
		lines.push(`dismiss_reason: ${yamlScalar(frontmatter.dismiss_reason)}`);
	}

	if (frontmatter.comments.length === 0) {
		lines.push('comments: []');
	} else {
		lines.push('comments:');
		for (const comment of frontmatter.comments) {
			lines.push(`  - author: ${yamlScalar(comment.author)}`);
			lines.push(
				...indentLines([`body: ${yamlScalar(comment.body)}`], 2),
			);
			lines.push(
				...indentLines(
					[`createdAt: ${yamlScalar(comment.createdAt)}`],
					2,
				),
			);
			lines.push(...indentLines([`url: ${yamlScalar(comment.url)}`], 2));
		}
	}

	return lines;
};

/** Serializes the frontmatter into a full `---`-fenced YAML block (including trailing fence + newline). */
export const serializeFrontmatterBlock = (
	frontmatter: IIssueScaffoldFrontmatter,
): string => {
	const lines = buildFrontmatterLines(frontmatter);
	return `${FRONTMATTER_FENCE}\n${lines.join('\n')}\n${FRONTMATTER_FENCE}\n`;
};

/**
 * Extracts the raw YAML block (content between the first pair of `---`
 * fences) from a full scaffold file, or `null` if none is present.
 */
export const extractFrontmatterBlock = (raw: string): string | null => {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	return m ? (m[1] ?? '') : null;
};

/** Splits a full scaffold file into `{ block, body }`; `block` is `null` when no frontmatter fence is found. */
export const splitFrontmatterAndBody = (
	raw: string,
): { block: string | null; body: string } => {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return { block: null, body: raw };
	return { block: m[1] ?? '', body: m[2] ?? '' };
};

const countIndent = (line: string): number => {
	let n = 0;
	for (const ch of line) {
		if (ch === ' ') n++;
		else break;
	}
	return n;
};

const parseCommentsBlock = (
	childLines: readonly string[],
): IGithubComment[] => {
	const comments: IGithubComment[] = [];
	let current: Partial<Record<keyof IGithubComment, string>> | null = null;

	const flush = () => {
		if (!current) return;
		comments.push({
			author: current.author ?? '',
			body: current.body ?? '',
			createdAt: current.createdAt ?? '',
			url: current.url ?? '',
		});
		current = null;
	};

	for (const raw of childLines) {
		const trimmed = raw.trim();
		if (trimmed === '') continue;
		if (trimmed.startsWith('- ')) {
			flush();
			current = {};
			const m = trimmed.slice(2).match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
			if (m) current[m[1] as keyof IGithubComment] = unquote(m[2] ?? '');
			continue;
		}
		const m = trimmed.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
		if (m && current) {
			current[m[1] as keyof IGithubComment] = unquote(m[2] ?? '');
		}
	}
	flush();
	return comments;
};

const parseStringArrayBlock = (childLines: readonly string[]): string[] =>
	childLines
		.map((l) => l.trim())
		.filter((l) => l.startsWith('- '))
		.map((l) => unquote(l.slice(2)));

/**
 * Parses a raw YAML frontmatter block (the content between the `---`
 * fences, without the fences themselves) into an `IIssueScaffoldFrontmatter`.
 * Throws if a required key is missing or has an unexpected shape — a
 * malformed scaffold should fail loudly, not silently coerce to defaults.
 */
export const parseFrontmatterBlock = (
	block: string,
): IIssueScaffoldFrontmatter => {
	const lines = block.split('\n');
	const scalars: Record<string, string> = {};
	let proposals: string[] = [];
	let comments: IGithubComment[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		if (line.trim() === '' || countIndent(line) > 0) {
			i++;
			continue;
		}
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)?$/);
		if (!m) {
			i++;
			continue;
		}
		const key = m[1] ?? '';
		const inline = (m[2] ?? '').trim();

		if (inline === '[]') {
			if (key === 'proposals') proposals = [];
			else if (key === 'comments') comments = [];
			i++;
			continue;
		}

		if (inline !== '') {
			scalars[key] = unquote(inline);
			i++;
			continue;
		}

		// Block value: collect indented child lines.
		i++;
		const childLines: string[] = [];
		while (i < lines.length) {
			const child = lines[i] ?? '';
			if (child.trim() === '') {
				childLines.push(child);
				i++;
				continue;
			}
			if (countIndent(child) === 0) break;
			childLines.push(child);
			i++;
		}
		if (key === 'proposals') proposals = parseStringArrayBlock(childLines);
		else if (key === 'comments') comments = parseCommentsBlock(childLines);
	}

	const required = [
		'source',
		'source_id',
		'source_url',
		'source_author',
		'ingested_at',
		'status',
		'resolution',
	] as const;
	for (const key of required) {
		if (scalars[key] === undefined) {
			throw new Error(
				`issue scaffold frontmatter missing required key: ${key}`,
			);
		}
	}

	const status = scalars.status;
	if (status !== 'ingested' && status !== 'analyzed') {
		throw new Error(
			`issue scaffold frontmatter has invalid status: ${status}`,
		);
	}
	const resolution = scalars.resolution;
	if (
		resolution !== 'pending' &&
		resolution !== 'promoted' &&
		resolution !== 'promoted-multiple' &&
		resolution !== 'dismissed'
	) {
		throw new Error(
			`issue scaffold frontmatter has invalid resolution: ${resolution}`,
		);
	}

	const frontmatter: IIssueScaffoldFrontmatter = {
		source: 'github',
		source_id: Number(scalars.source_id),
		source_url: scalars.source_url ?? '',
		source_author: scalars.source_author ?? '',
		ingested_at: scalars.ingested_at ?? '',
		status,
		resolution,
		proposals,
		comments,
		...(scalars.dismiss_reason !== undefined
			? { dismiss_reason: scalars.dismiss_reason }
			: {}),
	};
	return frontmatter;
};
