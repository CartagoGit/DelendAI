import { resolveWorkspaceContained } from '@mcp-vertex/core/public';
import { readFile } from 'node:fs/promises';

/**
 * Polyglot dependency listing (M33) — minimal, hand-rolled parsers for the
 * three other manifest formats this offline plugin can reasonably read
 * without a network call: Python (`pyproject.toml`), Rust (`Cargo.toml`)
 * and Go (`go.mod`). Same spirit as `frontmatter-parser.ts` elsewhere in
 * the repo: a documented SUBSET of the real format, not a general TOML
 * parser — adding one would be a new dependency for a read-only, best-effort
 * listing. Additive and separate from `listDeps`/`checkDeps` (npm-only,
 * unchanged contract): `deps_polyglot` is its own tool with its own shape.
 */

export type IPolyglotEcosystem = 'python' | 'rust' | 'go';

export interface IPolyglotDepEntry {
	readonly ecosystem: IPolyglotEcosystem;
	readonly name: string;
	/** Raw version constraint as written in the manifest. Never network-resolved. */
	readonly range: string;
	/** Manifest section/group it came from, e.g. `dependencies`, `dev-dependencies`. */
	readonly section: string;
}

export interface IPolyglotManifest {
	readonly ecosystem: IPolyglotEcosystem;
	readonly manifest: string;
	readonly deps: readonly IPolyglotDepEntry[];
}

// ---------------------------------------------------------------------------
// TOML subset: flat `[section]` tables of `key = "value"` or `key = { ... }`.
// Does NOT handle multi-line strings/arrays, nested arrays-of-tables, or
// arbitrary TOML — only what real-world dependency tables actually use.
// ---------------------------------------------------------------------------

interface ITomlTable {
	readonly name: string;
	readonly entries: ReadonlyMap<string, string>;
}

/** Split TOML source into `[section]` tables of simple `key = value` lines. */
const splitTomlTables = (raw: string): readonly ITomlTable[] => {
	const tables: ITomlTable[] = [];
	let current: { name: string; entries: Map<string, string> } | null = null;
	let accumulatingKey: string | null = null;
	let accumulatingValue = '';

	for (const rawLine of raw.split('\n')) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;

		if (accumulatingKey !== null && current) {
			accumulatingValue += ` ${line}`;
			if (line.includes(']')) {
				current.entries.set(accumulatingKey, accumulatingValue.trim());
				accumulatingKey = null;
				accumulatingValue = '';
			}
			continue;
		}

		const heading = /^\[([^\]]+)\]$/.exec(line);
		if (heading) {
			if (current)
				tables.push({ name: current.name, entries: current.entries });
			current = { name: (heading[1] ?? '').trim(), entries: new Map() };
			continue;
		}
		const kv = /^([^=]+?)\s*=\s*(.+)$/.exec(line);
		if (kv && current) {
			const key = (kv[1] ?? '').trim().replace(/^"(.*)"$/, '$1');
			const val = (kv[2] ?? '').trim();
			if (val.startsWith('[') && !val.endsWith(']')) {
				accumulatingKey = key;
				accumulatingValue = val;
			} else {
				current.entries.set(key, val);
			}
		}
	}
	if (current) tables.push({ name: current.name, entries: current.entries });
	return tables;
};

/** Strip a wrapping `"..."` or `'...'`, otherwise return as-is. */
const unquote = (value: string): string => {
	const m = /^["'](.*)["']$/.exec(value);
	return m ? (m[1] ?? '') : value;
};

/** Pull `version = "..."` out of an inline table `{ version = "1.0", ... }`; the whole literal otherwise (git/path deps aren't a comparable version). */
const versionFromInlineOrScalar = (value: string): string => {
	if (!value.startsWith('{')) return unquote(value);
	const m = /version\s*=\s*["']([^"']+)["']/.exec(value);
	return m ? (m[1] ?? value) : value;
};

// ---------------------------------------------------------------------------
// pyproject.toml — PEP 621 `[project] dependencies = [...]` and/or Poetry's
// `[tool.poetry.dependencies]` / `[tool.poetry.group.<g>.dependencies]`.
// ---------------------------------------------------------------------------

/** Split a PEP 508 requirement string ("foo>=1.0,<2.0") into name + raw constraint. */
const splitPep508 = (spec: string): { name: string; range: string } => {
	const cleaned = spec.split(';')[0]?.trim() ?? spec; // drop environment markers
	const m = /^([A-Za-z0-9_.-]+)\s*(\[[^\]]*\])?\s*(.*)$/.exec(cleaned);
	const name = m?.[1] ?? cleaned;
	const range = (m?.[3] ?? '').trim();
	return { name, range: range === '' ? '*' : range };
};

/** Extract a bracketed array's string literals: `["a>=1", "b"]` (single-line only). */
const arrayLiterals = (value: string): readonly string[] => {
	const inner = value.replace(/^\[/, '').replace(/\]$/, '');
	if (inner.trim() === '') return [];
	return inner
		.split(',')
		.map((entry) => unquote(entry.trim()))
		.filter((entry) => entry.length > 0);
};

export const parsePyprojectToml = (
	raw: string,
): readonly IPolyglotDepEntry[] => {
	const out: IPolyglotDepEntry[] = [];
	for (const table of splitTomlTables(raw)) {
		if (table.name === 'project') {
			const deps = table.entries.get('dependencies');
			if (deps?.startsWith('[')) {
				for (const spec of arrayLiterals(deps)) {
					const { name, range } = splitPep508(spec);
					out.push({
						ecosystem: 'python',
						name,
						range,
						section: 'dependencies',
					});
				}
			}
			continue;
		}
		const poetryGroup =
			/^tool\.poetry(?:\.group\.([^.]+))?\.dependencies$/.exec(
				table.name,
			);
		if (poetryGroup) {
			const section = poetryGroup[1]
				? `group.${poetryGroup[1]}`
				: 'dependencies';
			for (const [name, value] of table.entries) {
				if (name === 'python') continue; // the interpreter constraint, not a dep
				out.push({
					ecosystem: 'python',
					name,
					range: versionFromInlineOrScalar(value),
					section,
				});
			}
		}
	}
	return out;
};

// ---------------------------------------------------------------------------
// Cargo.toml — `[dependencies]` / `[dev-dependencies]` / `[build-dependencies]`
// (workspace root only; doesn't follow `[workspace.dependencies]` aliases).
// ---------------------------------------------------------------------------

const CARGO_SECTIONS = new Set([
	'dependencies',
	'dev-dependencies',
	'build-dependencies',
]);

export const parseCargoToml = (raw: string): readonly IPolyglotDepEntry[] => {
	const out: IPolyglotDepEntry[] = [];
	for (const table of splitTomlTables(raw)) {
		if (!CARGO_SECTIONS.has(table.name)) continue;
		for (const [name, value] of table.entries) {
			out.push({
				ecosystem: 'rust',
				name,
				range: versionFromInlineOrScalar(value),
				section: table.name,
			});
		}
	}
	return out;
};

// ---------------------------------------------------------------------------
// go.mod — `require <module> <version>` (single-line) and
// `require (\n\t<module> <version>\n)` (block). `// indirect` is kept as
// part of the section label so it's visible without being a separate field.
// ---------------------------------------------------------------------------

export const parseGoMod = (raw: string): readonly IPolyglotDepEntry[] => {
	const out: IPolyglotDepEntry[] = [];
	const lines = raw.split('\n');
	let inBlock = false;
	const pushEntry = (line: string): void => {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('//')) return;
		const indirect = / \/\/\s*indirect\b/.test(trimmed);
		const withoutComment = trimmed.replace(/\/\/.*$/, '').trim();
		const parts = withoutComment.split(/\s+/);
		const [name, version] = parts;
		if (!name || !version) return;
		out.push({
			ecosystem: 'go',
			name,
			range: version,
			section: indirect ? 'require (indirect)' : 'require',
		});
	};
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.startsWith('require (')) {
			inBlock = true;
			continue;
		}
		if (inBlock) {
			if (line === ')') {
				inBlock = false;
				continue;
			}
			pushEntry(line);
			continue;
		}
		if (line.startsWith('require '))
			pushEntry(line.slice('require '.length));
	}
	return out;
};

// ---------------------------------------------------------------------------
// Detection: read whichever of the three manifests exist at the workspace
// root. Each is independent — a Python+Go monorepo gets both, a pure npm
// project gets an empty list (use deps_list/deps_check for that case).
// ---------------------------------------------------------------------------

const MANIFESTS: ReadonlyArray<{
	ecosystem: IPolyglotEcosystem;
	file: string;
	parse: (raw: string) => readonly IPolyglotDepEntry[];
}> = [
	{ ecosystem: 'python', file: 'pyproject.toml', parse: parsePyprojectToml },
	{ ecosystem: 'rust', file: 'Cargo.toml', parse: parseCargoToml },
	{ ecosystem: 'go', file: 'go.mod', parse: parseGoMod },
];

/** Read + parse every polyglot manifest present at the workspace root. Missing ones are silently skipped (not every repo has Python/Rust/Go). */
export const listPolyglotDeps = async (
	rootAbs: string,
): Promise<readonly IPolyglotManifest[]> => {
	const out: IPolyglotManifest[] = [];
	for (const { ecosystem, file, parse } of MANIFESTS) {
		const contained = resolveWorkspaceContained(rootAbs, file);
		if (!contained.ok) continue;
		let raw: string;
		try {
			raw = await readFile(contained.abs, 'utf8');
		} catch {
			continue;
		}
		out.push({ ecosystem, manifest: file, deps: parse(raw) });
	}
	return out;
};
