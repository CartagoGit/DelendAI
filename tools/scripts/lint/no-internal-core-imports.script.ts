#!/usr/bin/env bun
/**
 * no-internal-core-imports.script.ts - f00034 s7 (gate) + audit-h3-fix.
 *
 * CLI code (and any tool we ship to consumers) may depend on the public
 * core API only. Imports from `@delendai/core/lib`,
 * `@delendai/core/dist`, or relative paths into `packages/core/src/lib`
 * couple the consumer to core internals and must fail.
 *
 * Audit 2026-06-23 extended the scan roots to also cover `tools/scripts`
 * (production entrypoints + their pure-module helpers, excluding the
 * `lint/` and `metrics/` subtrees which contain self-test fixtures).
 * Internal core imports inside the core's own `tests/` tree are still
 * allowed because they live next to the code they exercise.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { PUBLISH_ORDER } from '../release/release-plan';

const REPO_ROOT = process.cwd();
/**
 * Default scan roots (audit-h3-fix). Each entry is a workspace-relative
 * path; any directory under it is walked recursively except `node_modules`,
 * `dist`, and `coverage`. Pass a single root via the positional CLI arg
 * to narrow the scan for ad-hoc checks.
 */
const DEFAULT_SCAN_ROOTS: readonly string[] = [
	'packages/cli/src',
	'tools/scripts',
];
/**
 * Audit-h3-fix: subtrees under a scan root that legitimately touch core
 * internals on purpose. Each entry is matched as a workspace-relative
 * path prefix.
 */
const SCAN_EXCLUDE_PREFIXES: readonly string[] = [
	// The lint scripts ARE the rule: their fixture strings intentionally
	// reference `@delendai/core/lib/...` to assert the linter fires.
	'tools/scripts/lint/',
	// The metrics baseline snapshotter shells out to git, no internal
	// core imports expected; excluded defensively in case a future
	// fixture is added.
	'tools/scripts/metrics/',
];
const TS_FILE = /\.ts$/;

export interface IInternalCoreImportFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly specifier: string;
	readonly reason: string;
}

interface IForbiddenImportPattern {
	readonly test: RegExp;
	readonly reason: string;
}

const FORBIDDEN_IMPORTS: readonly IForbiddenImportPattern[] = [
	{
		test: /^@delendai\/core\/lib(?:\/|$)/,
		reason: 'use @delendai/core/public instead of @delendai/core/lib internals',
	},
	{
		test: /^@delendai\/core\/dist(?:\/|$)/,
		reason: 'use @delendai/core/public instead of @delendai/core/dist build output',
	},
	{
		test: /(?:^|\/)packages\/core\/src\/lib(?:\/|$)/,
		reason: 'use @delendai/core/public instead of a relative path into packages/core/src/lib',
	},
	{
		test: /(?:^|\/)\.\.\/\.\.\/core\/src\/lib(?:\/|$)/,
		reason: 'use @delendai/core/public instead of ../../core/src/lib internals',
	},
];

const IMPORT_SPECIFIER =
	/\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

const lineForOffset = (text: string, offset: number): number => {
	let line = 1;
	for (let i = 0; i < offset; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
};

const findForbiddenReason = (specifier: string): string | undefined =>
	FORBIDDEN_IMPORTS.find((pattern) => pattern.test.test(specifier))?.reason;

export const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): readonly IInternalCoreImportFinding[] => {
	const findings: IInternalCoreImportFinding[] = [];
	for (const match of text.matchAll(IMPORT_SPECIFIER)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier === undefined) continue;
		const reason = findForbiddenReason(specifier);
		if (reason === undefined) continue;
		findings.push({
			absPath,
			relPath,
			line: lineForOffset(text, match.index ?? 0),
			specifier,
			reason,
		});
	}
	return findings;
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'coverage'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (entry.isFile() && TS_FILE.test(entry.name)) {
				out.push(full);
			}
		}
	}
	return out;
};

/**
 * Audit-h3-fix: accepts a single root (string) or a list of roots
 * (readonly string[]). The default list lives in DEFAULT_SCAN_ROOTS.
 */
export const detectInternalCoreImports = async (
	roots: string | readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<readonly IInternalCoreImportFinding[]> => {
	const list = typeof roots === 'string' ? [roots] : roots;
	const findings: IInternalCoreImportFinding[] = [];
	for (const root of list) {
		const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
		for (const file of await walk(absRoot)) {
			const rel = relative(REPO_ROOT, file);
			// Audit-h3-fix: respect SCAN_EXCLUDE_PREFIXES. The lint subtree
			// and metrics subtree are skipped wholesale — fixture strings
			// there intentionally reference internal core paths.
			if (
				SCAN_EXCLUDE_PREFIXES.some(
					(prefix) =>
						rel === prefix.replace(/\/$/, '') ||
						rel.startsWith(prefix),
				)
			) {
				continue;
			}
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			findings.push(...scanText(content, file, rel));
		}
	}
	return findings;
};

export const formatReport = (
	findings: readonly IInternalCoreImportFinding[],
): string => {
	if (findings.length === 0) {
		return 'no-internal-core-imports: 0 violations.\n';
	}
	const lines: string[] = [
		`no-internal-core-imports: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		lines.push(
			`  ${finding.relPath}:${finding.line} imports "${finding.specifier}"`,
		);
		lines.push(`    ${finding.reason}`);
	}
	lines.push(
		'',
		'CLI code may import core through @delendai/core/public only.',
	);
	return `${lines.join('\n')}\n`;
};



/* ==============================================================
 * x00530 S3 — publication-boundary half of this lint.
 *
 * The rules above only ever looked at two scan roots and only ever
 * knew about `@delendai/core`. That is why 44 `@delendai/core/lib/`
 * deep imports survived three consecutive external audits: nothing
 * scanned `plugins/*`, and nothing checked any package but core.
 *
 * The half below walks EVERY package in `PUBLISH_ORDER` and holds
 * every `@delendai/*` import in it to the target package's own
 * `exports` map:
 *
 *   - a published package may not import a `private: true` package
 *     (an `npm install` of it cannot resolve the dependency);
 *   - a published package may not import a subpath the target does
 *     not declare in `exports` (it resolves inside the monorepo via
 *     tsconfig `paths` and 404s from a registry install);
 *   - a declared subpath that has no runtime condition (`import` /
 *     `require` / `default`) is types-only and cannot be imported
 *     for value either.
 *
 * `*.spec.ts` / `*.test.ts` files are skipped: they are excluded
 * from every package's `files` array, so they are never shipped and
 * cannot break a consumer's install.
 * ============================================================== */

/** Manifest fields this lint reads. */
interface IPackageManifest {
	readonly name?: string;
	readonly private?: boolean;
	readonly exports?: Record<string, unknown>;
	readonly dependencies?: Record<string, string>;
	readonly peerDependencies?: Record<string, string>;
}

export interface IWorkspacePackage {
	readonly dir: string;
	readonly name: string;
	readonly manifest: IPackageManifest;
}

export interface IPublicationBoundaryFinding {
	readonly relPath: string;
	readonly line: number;
	readonly specifier: string;
	readonly reason: string;
}

const WORKSPACE_GLOB_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'extensions',
];

const SPEC_FILE = /\.(?:spec|test)\.ts$/;

/**
 * Test-support modules that live under `src` but are reachable only
 * from specs (which are never published). They are excluded from the
 * boundary scan for the same reason `*.spec.ts` is.
 */
const TEST_SUPPORT_DIR = /(?:^|[\\/])(?:testing|__fixtures__|fixtures)[\\/]/;

/**
 * Blank out every backtick template literal, preserving newlines so
 * line numbers stay correct. Code generators (`packages/core/src/lib/
 * scaffold/*`) embed whole source files — imports included — inside
 * template literals; those are emitted strings, not imports of this
 * package, and flagging them would make the gate unusable.
 */
export const stripTemplateLiterals = (text: string): string => {
	let out = '';
	let inside = false;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (ch === '\\') {
			out += inside ? ' ' : ch;
			const next = text[i + 1];
			if (next !== undefined) {
				out += next === '\n' ? '\n' : ' ';
				i += 1;
			}
			continue;
		}
		if (ch === '`') {
			inside = !inside;
			out += ' ';
			continue;
		}
		out += inside && ch !== '\n' ? ' ' : ch;
	}
	return out;
};

/**
 * Statement-anchored specifier matcher for the boundary half.
 *
 * The legacy `IMPORT_SPECIFIER` above is greedy across newlines, so it
 * also matches specifiers that appear inside template literals — e.g.
 * the scaffold generators in `packages/core/src/lib/scaffold`, whose
 * emitted file CONTENT contains import statements, and doc-comment
 * usage examples. Those are strings, not imports; flagging them would
 * make the gate unusable. This matcher requires the statement to start
 * at the beginning of a line.
 */
const STATEMENT_SPECIFIER =
	/^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]|^[ \t]*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

/** Read every workspace manifest, keyed by package name. */
export const readWorkspacePackages = async (
	repoRoot: string = REPO_ROOT,
): Promise<ReadonlyMap<string, IWorkspacePackage>> => {
	const byName = new Map<string, IWorkspacePackage>();
	for (const root of WORKSPACE_GLOB_ROOTS) {
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(join(repoRoot, root), {
				withFileTypes: true,
			});
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dir = `${root}/${entry.name}`;
			const raw = await readFile(
				join(repoRoot, dir, 'package.json'),
				'utf8',
			).catch(() => '');
			if (raw.length === 0) continue;
			let manifest: IPackageManifest;
			try {
				manifest = JSON.parse(raw) as IPackageManifest;
			} catch {
				continue;
			}
			const name = manifest.name;
			if (name === undefined) continue;
			byName.set(name, { dir, name, manifest });
		}
	}
	return byName;
};

/**
 * Split `@scope/name/sub/path` into the package name and the
 * `exports`-style subpath (`.` when the import is the bare package).
 */
export const splitSpecifier = (
	specifier: string,
): { readonly pkg: string; readonly subpath: string } | undefined => {
	if (!specifier.startsWith('@delendai/')) return undefined;
	const segments = specifier.split('/');
	const pkg = segments.slice(0, 2).join('/');
	const rest = segments.slice(2);
	return { pkg, subpath: rest.length === 0 ? '.' : `./${rest.join('/')}` };
};

/** Does an `exports` key (possibly containing a single `*`) match? */
const exportKeyMatches = (key: string, subpath: string): boolean => {
	if (!key.includes('*')) return key === subpath;
	const [prefix = '', suffix = ''] = key.split('*', 2);
	return (
		subpath.length >= prefix.length + suffix.length &&
		subpath.startsWith(prefix) &&
		subpath.endsWith(suffix)
	);
};

/**
 * True when the matched export entry carries a runtime condition.
 * A subpath declared with `types` only (as `@delendai/commit-policy`
 * used to declare `./lib/services/storm-detector`) type-checks in the
 * monorepo and fails to resolve from an installed tarball.
 */
const hasRuntimeCondition = (entry: unknown): boolean => {
	if (typeof entry === 'string') return true;
	if (entry === null || typeof entry !== 'object') return false;
	const record = entry as Record<string, unknown>;
	for (const key of ['import', 'require', 'default', 'node']) {
		if (key in record && hasRuntimeCondition(record[key])) return true;
	}
	return false;
};

/**
 * Check one specifier against the workspace. Returns the reason it is
 * a publication-boundary violation, or `undefined` when it is legal.
 */
export const publicationBoundaryReason = (
	specifier: string,
	packages: ReadonlyMap<string, IWorkspacePackage>,
	selfName: string,
): string | undefined => {
	const split = splitSpecifier(specifier);
	if (split === undefined) return undefined;
	const target = packages.get(split.pkg);
	// Not a workspace package — it resolves from the registry like any
	// third-party dependency; nothing for this lint to say.
	if (target === undefined) return undefined;
	if (target.manifest.private === true && split.pkg !== selfName) {
		return `${split.pkg} is "private": true, so an npm install of this package cannot resolve it. Publish it (and add it to PUBLISH_ORDER) or stop depending on it.`;
	}
	const exportsMap = target.manifest.exports;
	if (exportsMap === undefined) {
		return split.subpath === '.'
			? undefined
			: `${split.pkg} declares no "exports" map, so "${split.subpath}" is not a supported entry point.`;
	}
	const key = Object.keys(exportsMap).find((candidate) =>
		exportKeyMatches(candidate, split.subpath),
	);
	if (key === undefined) {
		return `${split.pkg} does not declare "${split.subpath}" in its "exports" (declared: ${Object.keys(exportsMap).join(', ')}). It resolves here only through tsconfig paths and 404s from a registry install.`;
	}
	if (!hasRuntimeCondition(exportsMap[key])) {
		return `${split.pkg} declares "${key}" with types but no runtime condition ("import"/"require"/"default"), so the subpath cannot be imported from an installed package.`;
	}
	return undefined;
};

/**
 * Manifest half: no PUBLISH_ORDER package may declare a `private: true`
 * `@delendai/*` package in `dependencies` or `peerDependencies`.
 */
export const detectPrivateDependencies = async (
	repoRoot: string = REPO_ROOT,
): Promise<readonly IPublicationBoundaryFinding[]> => {
	const packages = await readWorkspacePackages(repoRoot);
	const byDir = new Map(
		[...packages.values()].map((pkg) => [pkg.dir, pkg] as const),
	);
	const findings: IPublicationBoundaryFinding[] = [];
	for (const dir of PUBLISH_ORDER) {
		const pkg = byDir.get(dir);
		if (pkg === undefined) continue;
		const declared = {
			...(pkg.manifest.dependencies ?? {}),
			...(pkg.manifest.peerDependencies ?? {}),
		};
		for (const depName of Object.keys(declared)) {
			const dep = packages.get(depName);
			if (dep === undefined) continue;
			if (dep.manifest.private !== true) continue;
			findings.push({
				relPath: `${dir}/package.json`,
				line: 1,
				specifier: depName,
				reason: `${pkg.name} is in PUBLISH_ORDER but depends on ${depName}, which is "private": true and is never published.`,
			});
		}
	}
	return findings;
};

/**
 * Import half: every `@delendai/*` import inside a PUBLISH_ORDER
 * package's shipped sources must hit a declared, runtime-resolvable
 * subpath of a published package.
 */
export const detectPublicationBoundaryViolations = async (
	repoRoot: string = REPO_ROOT,
): Promise<readonly IPublicationBoundaryFinding[]> => {
	const packages = await readWorkspacePackages(repoRoot);
	const byDir = new Map(
		[...packages.values()].map((pkg) => [pkg.dir, pkg] as const),
	);
	const findings: IPublicationBoundaryFinding[] = [];
	for (const dir of PUBLISH_ORDER) {
		const pkg = byDir.get(dir);
		if (pkg === undefined) continue;
		for (const file of await walk(join(repoRoot, dir, 'src'))) {
			if (SPEC_FILE.test(file)) continue;
			if (TEST_SUPPORT_DIR.test(file)) continue;
			const rel = relative(repoRoot, file);
			const raw = await readFile(file, 'utf8').catch(() => '');
			if (raw.length === 0) continue;
			const content = stripTemplateLiterals(raw);
			for (const match of content.matchAll(STATEMENT_SPECIFIER)) {
				const specifier = match[1] ?? match[2] ?? match[3];
				if (specifier === undefined) continue;
				const reason = publicationBoundaryReason(
					specifier,
					packages,
					pkg.name,
				);
				if (reason === undefined) continue;
				findings.push({
					relPath: rel,
					line: lineForOffset(content, match.index ?? 0),
					specifier,
					reason,
				});
			}
		}
	}
	return findings;
};

export const formatBoundaryReport = (
	findings: readonly IPublicationBoundaryFinding[],
): string => {
	if (findings.length === 0) {
		return 'publication-boundary: 0 violations.\n';
	}
	const lines: string[] = [
		`publication-boundary: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		lines.push(
			`  ${finding.relPath}:${finding.line} -> "${finding.specifier}"`,
		);
		lines.push(`    ${finding.reason}`);
	}
	lines.push(
		'',
		'A package in PUBLISH_ORDER must be installable from npm on its own:',
		'no dependency on a "private": true package, and no import of a',
		'subpath the target package does not declare in its "exports".',
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const findings = await detectInternalCoreImports();
	const boundary = [
		...(await detectPrivateDependencies()),
		...(await detectPublicationBoundaryViolations()),
	];
	const report = formatReport(findings);
	const boundaryReport = formatBoundaryReport(boundary);
	if (findings.length === 0 && boundary.length === 0) {
		process.stdout.write(report);
		process.stdout.write(boundaryReport);
		return 0;
	}
	process.stderr.write(report);
	process.stderr.write(boundaryReport);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
