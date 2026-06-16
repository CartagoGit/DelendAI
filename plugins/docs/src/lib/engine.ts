import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

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
	'node_modules', '.git', 'dist', 'build', 'coverage', '.cache',
];
const MAX_READ_BYTES = 256 * 1024;

const extOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const clamp = (v: number | undefined, def: number, lo: number, hi: number): number =>
	v === undefined || Number.isNaN(v) ? def : Math.max(lo, Math.min(hi, Math.floor(v)));

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
 * injectable. Low-token: titles only, count-capped. [N19]
 */
export const listDocs = (
	workspaceRootAbs: string,
	options: IDocsOptions = {}
): { docs: IDocEntry[]; truncated: boolean } => {
	const roots = options.roots && options.roots.length > 0 ? options.roots : DEFAULT_DOC_ROOTS;
	const extensions = new Set(
		(options.extensions && options.extensions.length > 0
			? options.extensions
			: DEFAULT_EXTENSIONS
		).map((e) => e.toLowerCase())
	);
	const ignore = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const max = clamp(options.maxResults, 200, 1, 1000);

	const docs: IDocEntry[] = [];
	let truncated = false;

	const addFile = (abs: string): void => {
		if (truncated) return;
		if (!extensions.has(extOf(abs))) return;
		let raw: string;
		try {
			const st = statSync(abs);
			if (!st.isFile() || st.size > MAX_READ_BYTES) return;
			raw = readFileSync(abs, 'utf8');
		} catch {
			return;
		}
		const r = rel(workspaceRootAbs, abs);
		docs.push({ path: r, title: extractTitle(raw, r) });
		if (docs.length >= max) truncated = true;
	};

	const walk = (absDir: string): void => {
		if (truncated) return;
		let entries;
		try {
			entries = readdirSync(absDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
			if (truncated) return;
			if (e.isDirectory()) {
				if (!ignore.has(e.name)) walk(join(absDir, e.name));
			} else if (e.isFile()) {
				addFile(join(absDir, e.name));
			}
		}
	};

	for (const root of roots) {
		if (truncated) break;
		const abs = join(workspaceRootAbs, root);
		if (!existsSync(abs)) continue;
		try {
			statSync(abs).isDirectory() ? walk(abs) : addFile(abs);
		} catch {
			// ignore unreadable root
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
export const readDoc = (
	workspaceRootAbs: string,
	relPath: string
): IDocContent => {
	const abs = resolve(workspaceRootAbs, relPath);
	const within = abs === workspaceRootAbs || abs.startsWith(workspaceRootAbs + sep);
	if (!within || !existsSync(abs)) {
		return { path: relPath, title: relPath, content: '', truncated: false, found: false };
	}
	let raw: string;
	try {
		if (!statSync(abs).isFile()) {
			return { path: relPath, title: relPath, content: '', truncated: false, found: false };
		}
		raw = readFileSync(abs, 'utf8');
	} catch {
		return { path: relPath, title: relPath, content: '', truncated: false, found: false };
	}
	const truncated = raw.length > MAX_READ_BYTES;
	const content = truncated ? raw.slice(0, MAX_READ_BYTES) : raw;
	const r = rel(workspaceRootAbs, abs);
	return { path: r, title: extractTitle(raw, r), content, truncated, found: true };
};
