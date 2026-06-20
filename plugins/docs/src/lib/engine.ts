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
