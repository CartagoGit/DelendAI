#!/usr/bin/env bun
/**
 * shared-ui-ratchet.script.ts — f00102 S4 (gate).
 *
 * Once a UI component lives in `@delendai/shared/components/` as the
 * authoritative source, no consumer may inline a copy of its markup
 * or write per-surface CSS that forks the visual surface. This
 * ratchet enforces the discipline by scanning the consumer trees
 * (apps/web, extensions/vscode, packages/ui-extension, plugins/*)
 * for two failure modes:
 *
 *   1. **Inline copy of a shared component.** A render function
 *      that hand-rolls markup equivalent to a shared one. We catch
 *      this by looking for literal class names that the shared
 *      components own (e.g. `class="ui-callout"`,
 *      `class="mcpv-callout"`, `class="ui-tabs"`). The shared
 *      component is the only place those strings should originate;
 *      consumers either import the renderer or — for the docs
 *      site's transitional period — use the .astro wrapper which
 *      forwards to the shared renderer.
 *
 *   2. **Forked CSS for a shared class.** A standalone .scss file
 *      that defines `.mcpv-callout` rules outside the shared partial,
 *      or that adds new selectors under the shared block. The
 *      shared SCSS is the only place BEM rules for shared
 *      components may live.
 *
 * Why the ratchet
 * ---------------
 * The shared-UI migration (f00102) split each component into a
 * pair (`*.ts` + `*.scss`) under `apps/shared/src/components/`.
 * Without a ratchet, the next slice can re-introduce a markup
 * fork in `extensions/vscode/src/dev/settings-panel.ts` (the
 * `setup__*` widget rule). The ratchet makes it impossible
 * to land silently.
 *
 * Waivers
 * -------
 * A waiver is a one-line JSON entry in `shared-ui-ratchet.waivers.json`
 * that names a specific (file, class) pair and explains why it
 * stays out of shared. Twelve chars is the minimum waiver length.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_WAIVERS = 'tools/scripts/lint/shared-ui-ratchet.waivers.json';

export const MIN_WAIVER_LENGTH = 12;

/**
 * Class names that the shared components own. Each entry is the
 * BEM root used by the shared renderer / SCSS. Anything emitting
 * or styling these elsewhere is a ratchet violation.
 *
 * The list is hand-maintained; the alternative — auto-detecting it
 * by scanning the shared source for `class="...mcpv-*"` patterns —
 * misses the BEM-only uses (e.g. `.mcpv-callout__icon`) and adds
 * runtime cost.
 */
export const SHARED_BEM_ROOTS: ReadonlyArray<string> = Object.freeze([
	// ui/* — every component from slices S1 + S2.
	'mcpv-callout',
	'mcpv-tabs',
	'mcpv-code',
	'mcpv-stepper',
	'mcpv-copybtn',
	'mcpv-page-header',
	'mcpv-sitefoot',
]);

/**
 * Per-surface consumer roots. Each entry is recursively walked
 * with a `.ts`/`.astro` filter; the scanner collects every file
 * that contains a forbidden string.
 */
const SCAN_ROOTS: ReadonlyArray<string> = Object.freeze([
	'apps/web',
	'apps/shared',
	'extensions/vscode',
	'packages/ui-extension',
]);

const TS_FILE = /\.tsx?$/;
const ASTRO_FILE = /\.astro$/;
const SCSS_FILE = /\.scss$/;

const FORBIDDEN_CLASSNAME = new RegExp(
	`class(?:Name)?=[\`'"](?:[^'"\`]*\\s)?(${SHARED_BEM_ROOTS.join('|')})`,
	'g',
);

export type Violation = {
	readonly file: string;
	readonly kind: 'inline-class' | 'forked-scss' | 'hardcoded-aria';
	readonly className: string;
	readonly note: string;
};

const SCAN_IGNORE = /(^|\/)(node_modules|dist|build|coverage|\.git)\//;

/**
 * Trusted directories where the shared component strings
 * legitimately appear in source. The components live in
 * `apps/shared/src/components/`, and the docs-site .astro
 * wrappers under `apps/web/src/components/` import the shared
 * renderer and forward its output — they may legitimately apply
 * shared BEM class names.
 *
 * Surfacing a violation against a trusted file would be a false
 * positive; instead we skip them during the scan and require the
 * shared `@delendai/shared/components` import to actually be
 * present so the `.astro` is, in fact, a wrapper.
 */
const SHARED_SOURCE_DIR = 'apps/shared/src/components/';
const SHARED_STYLES_SOURCE_DIR = 'apps/shared/src/styles/';
const TRUSTED_WRAPPER_DIRS: ReadonlyArray<string> = Object.freeze([
	'apps/web/src/components/',
	'packages/ui-extension/src/dashboard/',
]);

const SHARED_RENDERER_IMPORT = /from\s+['"]@delendai\/shared\/components\//;

/**
 * Scan a single source file for inline copies of a shared
 * BEM class. Matches `.tsx`, `.ts`, `.astro`. Returns violations
 * for every occurrence of a forbidden class string.
 *
 * Files under `apps/shared/src/components/` are trusted: the
 * shared renderer IS the place where the class string is owned.
 * Files under `apps/web/src/components/` (the docs-site wrappers)
 * are trusted when they `@use` the shared renderer; otherwise
 * the inline class is reported.
 */
export const findInlineClasses = (
	relPath: string,
	source: string,
): Violation[] => {
	// Source-of-truth files are exempt (the renderer IS the
	// owner of the class string) — both the .ts sources and the
	// SCSS partials under apps/shared/src/{components,styles}/.
	if (
		relPath.startsWith(SHARED_SOURCE_DIR) ||
		relPath.startsWith(SHARED_STYLES_SOURCE_DIR)
	) {
		return [];
	}
	// Spec / test files are exempt — the literals are the
	// contract the test pins. Trust model: when a `*.spec.ts`
	// says `expect(html).toContain('mcpv-tabs')`, the spec is the
	// source of truth for that string, not a fork to flag.
	if (/\.spec\.[mc]?[jt]sx?$/.test(relPath)) return [];
	// Docs-site wrappers: only trusted when they actually pull
	// the shared renderer. Without the import, an inline
	// `class="mcpv-callout"` in this folder IS a fork.
	if (
		TRUSTED_WRAPPER_DIRS.some((dir) => relPath.startsWith(dir)) &&
		SHARED_RENDERER_IMPORT.test(source)
	) {
		return [];
	}

	const out: Violation[] = [];
	FORBIDDEN_CLASSNAME.lastIndex = 0;
	let m = FORBIDDEN_CLASSNAME.exec(source);
	while (m !== null) {
		out.push({
			file: relPath,
			kind: 'inline-class',
			className: m[1] ?? '',
			note: `inline \`${m[1]}\` class on \`${relPath}\` — use the shared renderer (apps/shared/src/components/...) instead`,
		});
		m = FORBIDDEN_CLASSNAME.exec(source);
	}
	return out;
};

/**
 * x00103 S2: literal `aria-label="…"` (or `title="…"`) text inside the
 * shared UI package must come from an option or the i18n dict — a
 * hardcoded English literal is announced verbatim by screen readers in
 * the other 11 languages. Interpolated values (`aria-label="${…}"`) and
 * attribute REFERENCES (`aria-labelledby`) are fine.
 */
const HARDCODED_A11Y_ATTR = /\b(aria-label|title)="([A-Za-z][A-Za-z .,'-]*)"/g;
const A11Y_SCAN_DIR = 'packages/ui-extension/src/';

export const findHardcodedAriaLabels = (
	relPath: string,
	source: string,
): Violation[] => {
	if (!relPath.startsWith(A11Y_SCAN_DIR)) return [];
	if (/\.spec\.[mc]?[jt]sx?$/.test(relPath)) return [];
	const out: Violation[] = [];
	HARDCODED_A11Y_ATTR.lastIndex = 0;
	let m = HARDCODED_A11Y_ATTR.exec(source);
	while (m !== null) {
		out.push({
			file: relPath,
			kind: 'hardcoded-aria',
			className: `${m[1]}:${m[2] ?? ''}`,
			note: `hardcoded ${m[1]} "${m[2]}" — thread it through an option default + extensionText(dict, …) so screen readers hear the active language`,
		});
		m = HARDCODED_A11Y_ATTR.exec(source);
	}
	return out;
};

const SHARED_SCSS_TOKENS = new Set([
	'mcpv-callout',
	'mcpv-tabs',
	'mcpv-code',
	'mcpv-stepper',
	'mcpv-copybtn',
	'mcpv-page-header',
	'mcpv-sitefoot',
]);

/**
 * Detect per-surface SCSS that defines rules for a shared BEM
 * class — only the partials under `apps/shared/src/styles/` may do
 * so. Audited as `forked-scss`.
 */
export const findForkedScss = (
	relPath: string,
	source: string,
): Violation[] => {
	// Both shared sources (under apps/shared/src/components/) and the
	// canonical styles directory (apps/shared/src/styles/) own
	// shared rules.
	if (
		relPath.startsWith(SHARED_SOURCE_DIR) ||
		relPath.startsWith(SHARED_STYLES_SOURCE_DIR)
	) {
		return [];
	}
	// Spec / test files are exempt — the literals are the contract
	// the test pins, not a fork to flag.
	if (/\.spec\.[mc]?[jt]sx?$/.test(relPath)) return [];
	const out: Violation[] = [];
	for (const token of SHARED_SCSS_TOKENS) {
		const re = new RegExp(`(^|[\\s,.])${token}[\\s,{]`, 'g');
		if (re.test(source)) {
			out.push({
				file: relPath,
				kind: 'forked-scss',
				className: token,
				note: `\`${token}\` selectors in \`${relPath}\` — keep them in apps/shared/src/styles/components/${token}.scss only`,
			});
		}
	}
	return out;
};

/**
 * Recursively walk a directory and yield every `.ts`/`.astro`/
 * `.scss` file under it. Stops at `node_modules` / `dist`.
 */
export const walkConsumerFiles = async function* (
	root: string,
): AsyncGenerator<{ absPath: string; relPath: string }> {
	const { readdir } = await import('node:fs/promises');
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const abs = join(root, entry.name);
		if (SCAN_IGNORE.test(abs)) continue;
		if (entry.isDirectory()) {
			yield* walkConsumerFiles(abs);
		} else if (
			entry.isFile() &&
			(TS_FILE.test(entry.name) ||
				ASTRO_FILE.test(entry.name) ||
				SCSS_FILE.test(entry.name))
		) {
			const rel = abs.slice(REPO_ROOT.length + 1);
			yield { absPath: abs, relPath: rel };
		}
	}
};

export type Waiver = {
	readonly file: string;
	readonly className: string;
	readonly reason: string;
};

/**
 * Load and normalise the waivers file. Returns an empty map when
 * the file is missing.
 */
export const loadWaivers = async (
	waiversPath = DEFAULT_WAIVERS,
): Promise<{
	readonly waivers: ReadonlyArray<Waiver>;
	readonly invalid: ReadonlyArray<unknown>;
}> => {
	const abs = isAbsolute(waiversPath)
		? waiversPath
		: join(REPO_ROOT, waiversPath);
	let raw: string;
	try {
		raw = await readFile(abs, 'utf8');
	} catch {
		return { waivers: [], invalid: [] };
	}
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) {
		return { waivers: [], invalid: [parsed] };
	}
	const out: Waiver[] = [];
	const invalid: unknown[] = [];
	for (const entry of parsed) {
		if (
			entry &&
			typeof entry === 'object' &&
			'file' in entry &&
			'className' in entry &&
			'reason' in entry &&
			typeof (entry as Waiver).reason === 'string' &&
			(entry as Waiver).reason.length >= MIN_WAIVER_LENGTH
		) {
			out.push(entry as Waiver);
		} else {
			invalid.push(entry);
		}
	}
	return { waivers: out, invalid };
};

const findViolations = async (
	waivers: ReadonlyArray<Waiver>,
): Promise<Violation[]> => {
	const waiverKeys = new Set(waivers.map((w) => `${w.file}|${w.className}`));
	const out: Violation[] = [];
	for (const root of SCAN_ROOTS) {
		const abs = isAbsolute(root) ? root : join(REPO_ROOT, root);
		for await (const { absPath, relPath } of walkConsumerFiles(abs)) {
			const source = await readFile(absPath, 'utf8');
			out.push(
				...findInlineClasses(relPath, source),
				...findForkedScss(relPath, source),
				...findHardcodedAriaLabels(relPath, source),
			);
		}
	}
	return out.filter((v) => !waiverKeys.has(`${v.file}|${v.className}`));
};

/**
 * Pretty-print the report. Mirrors the tone of the other ratchet
 * scripts (lines-first, total at the end).
 */
const renderReport = (
	violations: ReadonlyArray<Violation>,
	invalidWaivers: ReadonlyArray<unknown>,
): string => {
	const lines: string[] = [];
	for (const v of violations) {
		lines.push(`${v.file}: forbidden ${v.kind} \`${v.className}\``);
		lines.push(`  → ${v.note}`);
	}
	if (invalidWaivers.length > 0) {
		lines.push(
			`shared-ui-ratchet: ${invalidWaivers.length} invalid waiver(s) — reason must be >= ${MIN_WAIVER_LENGTH} chars.`,
		);
	}
	if (violations.length === 0) {
		lines.push(`shared-ui-ratchet: 0 violations.`);
	} else {
		lines.push(
			`shared-ui-ratchet: ${violations.length} violation${violations.length === 1 ? '' : 's'}.`,
		);
	}
	return lines.join('\n');
};

const main = async (): Promise<number> => {
	const { waivers, invalid } = await loadWaivers();
	const violations = await findViolations(waivers);
	const report = renderReport(violations, invalid);
	console.log(report);
	return violations.length === 0 && invalid.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
