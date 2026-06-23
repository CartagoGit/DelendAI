import {
	resolveWorkspaceContained,
	walkAllowedFiles,
} from '@mcp-vertex/core/public';
import { readFile, stat } from 'node:fs/promises';
import { relative, sep } from 'node:path';

/** One catalogued doc. `path` is relative to the workspace root. */
export interface IDocEntry {
	readonly path: string;
	readonly title: string;
}

export interface IDocsOptions {
	/** Dirs/files (relative to the workspace root) to index. */
	readonly roots?: readonly string[];
	/** Markdown extensions (without dot). Default `['md','mdx']`. */
	readonly extensions?: readonly string[];
	/** Max catalogued entries. Default 200 (clamped 1..1000). */
	readonly maxResults?: number;
	/** Directory names to skip. Default: build/vcs/dep dirs. */
	readonly ignoreDirs?: readonly string[];
}

export const DEFAULT_DOC_ROOTS: readonly string[] = ['docs', 'README.md'];
const DEFAULT_EXTENSIONS: readonly string[] = ['md', 'mdx'];
const DEFAULT_IGNORE_DIRS: readonly string[] = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'coverage',
	'.cache',
];
const MAX_READ_BYTES = 256 * 1024;

const extOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const clamp = (
	v: number | undefined,
	def: number,
	lo: number,
	hi: number,
): number =>
	v === undefined || Number.isNaN(v)
		? def
		: Math.max(lo, Math.min(hi, Math.floor(v)));

/** Title = first `# ` heading, else frontmatter `title:`, else the path. */
export const extractTitle = (raw: string, fallback: string): string => {
	const fm = raw.match(/^---\n([\s\S]*?)\n---/);
	if (fm) {
		const t = fm[1]!.match(/^title:\s*(.+)$/m);
		if (t) return t[1]!.trim().replace(/^['"]|['"]$/g, '');
	}
	const h = raw.match(/^#\s+(.+)$/m);
	if (h) return h[1]!.trim();
	return fallback;
};

const rel = (rootAbs: string, abs: string): string =>
	relative(rootAbs, abs).split(sep).join('/');

/**
 * Catalogue the project's markdown docs under the configured roots:
 * `{ path, title }` per file (title from the first heading/frontmatter).
 * Pure over the injected workspace root; agnostic — roots/extensions are
 * injectable. Low-token: titles only, count-capped. Async I/O throughout so
 * cataloguing never blocks the MCP server's event loop. [N19, M4]
 */
export const listDocs = async (
	workspaceRootAbs: string,
	options: IDocsOptions = {},
): Promise<{ docs: IDocEntry[]; truncated: boolean }> => {
	const roots =
		options.roots && options.roots.length > 0
			? options.roots
			: DEFAULT_DOC_ROOTS;
	const extensions = new Set(
		(options.extensions && options.extensions.length > 0
			? options.extensions
			: DEFAULT_EXTENSIONS
		).map((e) => e.toLowerCase()),
	);
	const ignore = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const max = clamp(options.maxResults, 200, 1, 1000);

	const docs: IDocEntry[] = [];
	let truncated = false;

	const addFile = async (abs: string): Promise<void> => {
		if (truncated) return;
		if (!extensions.has(extOf(abs))) return;
		let raw: string;
		try {
			const st = await stat(abs);
			if (!st.isFile() || st.size > MAX_READ_BYTES) return;
			raw = await readFile(abs, 'utf8');
		} catch {
			return;
		}
		const r = rel(workspaceRootAbs, abs);
		docs.push({ path: r, title: extractTitle(raw, r) });
		if (docs.length >= max) truncated = true;
	};

	const walk = (rootAbs: string): Promise<void> =>
		walkAllowedFiles({
			workspaceRootAbs,
			rootAbs,
			isTruncated: () => truncated,
			shouldSkipDir: (_relDirPath, dirName) => ignore.has(dirName),
			visitFile: addFile,
		});

	for (const root of roots) {
		if (truncated) break;
		// Containment: `docs_list` must apply the same guard as `docs_read` — a
		// root that escapes the workspace (`..`, absolute) is skipped.
		const contained = resolveWorkspaceContained(workspaceRootAbs, root);
		if (!contained.ok) continue;
		const abs = contained.abs;
		try {
			(await stat(abs)).isDirectory()
				? await walk(abs)
				: await addFile(abs);
		} catch {
			// missing or unreadable root: skip
		}
	}
	docs.sort((a, b) => a.path.localeCompare(b.path));
	return { docs, truncated };
};

export interface IDocContent {
	readonly path: string;
	readonly title: string;
	readonly content: string;
	readonly truncated: boolean;
	readonly found: boolean;
}

export interface IDocSearchHit {
	readonly path: string;
	readonly title: string;
	readonly score: number;
	/** ≤ `SNIPPET_MAX_CHARS` chars of context around the first match. */
	readonly snippet: string;
}

const SNIPPET_MAX_CHARS = 200;
const SNIPPET_CONTEXT_CHARS = 80;
const TITLE_HIT_WEIGHT = 3;

const countOccurrences = (haystack: string, needle: string): number => {
	if (needle.length === 0) return 0;
	let count = 0;
	let from = 0;
	for (;;) {
		const idx = haystack.indexOf(needle, from);
		if (idx < 0) break;
		count += 1;
		from = idx + needle.length;
	}
	return count;
};

/**
 * Snippet of ≤ {@link SNIPPET_MAX_CHARS} chars centred on the first
 * case-insensitive match of `query` in `body`. Falls back to the start of
 * the body when there's no literal hit (e.g. the match came only from the
 * title) so the caller always gets a preview, never an empty string.
 */
const snippetAround = (body: string, query: string): string => {
	const lower = body.toLowerCase();
	const idx = query.length > 0 ? lower.indexOf(query.toLowerCase()) : -1;
	const center = idx >= 0 ? idx : 0;
	const start = Math.max(0, center - SNIPPET_CONTEXT_CHARS);
	const end = Math.min(
		body.length,
		center + Math.max(query.length, 1) + SNIPPET_CONTEXT_CHARS,
	);
	const slice = body.slice(start, end).replace(/\s+/g, ' ').trim();
	const prefix = start > 0 ? '… ' : '';
	const suffix = end < body.length ? ' …' : '';
	const framed = `${prefix}${slice}${suffix}`;
	return framed.length > SNIPPET_MAX_CHARS
		? `${framed.slice(0, SNIPPET_MAX_CHARS - 1)}…`
		: framed;
};

/**
 * Rank-search the project's markdown docs by a free-text query. Reuses
 * {@link listDocs}'s catalogue (same roots/extensions/containment guard)
 * and scores each doc by `(titleHits * 3) + bodyHits` — a linear scan,
 * which is the documented, accepted limit at the 10-50 doc scale this
 * plugin targets (see f00028 R3). Read-only; never writes.
 */
export const searchDocs = async (
	workspaceRootAbs: string,
	query: string,
	options: IDocsOptions & { readonly limit?: number } = {},
): Promise<{ hits: IDocSearchHit[]; truncated: boolean }> => {
	const trimmed = query.trim();
	if (trimmed.length === 0) return { hits: [], truncated: false };
	const limit = clamp(options.limit, 10, 1, 100);

	const { docs, truncated } = await listDocs(workspaceRootAbs, options);
	const needle = trimmed.toLowerCase();

	const hits: IDocSearchHit[] = [];
	for (const doc of docs) {
		const titleHits = countOccurrences(doc.title.toLowerCase(), needle);
		const { content } = await readDoc(workspaceRootAbs, doc.path);
		const bodyHits = countOccurrences(content.toLowerCase(), needle);
		const score = titleHits * TITLE_HIT_WEIGHT + bodyHits;
		if (score <= 0) continue;
		hits.push({
			path: doc.path,
			title: doc.title,
			score,
			snippet: snippetAround(content, trimmed),
		});
	}

	hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
	return { hits: hits.slice(0, limit), truncated };
};

/**
 * Read one doc by its workspace-relative path. Refuses paths that escape
 * the workspace root (no `..` traversal). Content is capped.
 */
export const readDoc = async (
	workspaceRootAbs: string,
	relPath: string,
): Promise<IDocContent> => {
	const miss = (): IDocContent => ({
		path: relPath,
		title: relPath,
		content: '',
		truncated: false,
		found: false,
	});
	const contained = resolveWorkspaceContained(workspaceRootAbs, relPath);
	if (!contained.ok) return miss();
	const abs = contained.abs;
	let raw: string;
	try {
		if (!(await stat(abs)).isFile()) return miss();
		raw = await readFile(abs, 'utf8');
	} catch {
		return miss();
	}
	const truncated = raw.length > MAX_READ_BYTES;
	const content = truncated ? raw.slice(0, MAX_READ_BYTES) : raw;
	const r = rel(workspaceRootAbs, abs);
	return {
		path: r,
		title: extractTitle(raw, r),
		content,
		truncated,
		found: true,
	};
};
