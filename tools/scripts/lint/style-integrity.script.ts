#!/usr/bin/env bun
/**
 * style-integrity.script.ts — f00099 S2 (gate).
 *
 * Two real breakages shipped invisible to every gate: a stylesheet that
 * was never `@use`'d left every generated markdown page unstyled, and a
 * webview linked its CSS with a relative href that never loads. `lint:scss`
 * (stylelint) can never catch this class of drift — it lints scss files in
 * isolation and says nothing about markup that references missing
 * selectors. This ratchet cross-checks the two surfaces:
 *
 *   - **DEFINED** classes come from a brace-context scss parser over
 *     `apps/web/src/styles` + `apps/shared/src/styles` that expands scss
 *     nesting (`&__x` / `&--x` / `&-x` under the parent selector stack)
 *     and splits comma-separated selector lists (`.a, .b { }` defines
 *     both). Component-local `<style>` blocks inside an `.astro` file
 *     define classes for THAT file only.
 *   - **USED** classes are `class="…"` string literals in `.astro` markup
 *     (frontmatter, `<style>` and `<script>` blocks stripped; dynamic
 *     `class={...}` / `class:list={...}` expressions are skipped).
 *
 * Every used-but-undefined class fails the gate unless it carries a
 * documented waiver in `style-integrity.waivers.json` (bare BEM namespace
 * hooks whose elements/modifiers carry the styles). A few third-party /
 * cross-ratchet prefixes are built-in ignores instead of waivers:
 * `astro-*` (Astro islands), `pagefind*` (search UI), `markdown-body`
 * and `sr-only` (injected utility hooks), and `mcpv-*` — shared mcpv-*
 * tokens are owned by the f00102 shared-ui ratchet (lint:shared-ui-ratchet),
 * which is the authoritative gate for shared-component classes.
 */
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_STYLE_ROOTS = [
	'apps/web/src/styles',
	'apps/shared/src/styles',
] as const;
const DEFAULT_ASTRO_ROOTS = ['apps/web/src'] as const;
const DEFAULT_WAIVERS = 'tools/scripts/lint/style-integrity.waivers.json';

/**
 * A waiver must be a documented reason, not a "TODO". Twelve characters
 * is deliberately low — it only blocks placeholder noise (same bar as
 * lint:cli-ui-parity and lint:shared-ui-ratchet).
 */
export const MIN_WAIVER_LENGTH = 12;

/**
 * Built-in ignores — classes no scss in this repo is expected to define.
 * `mcpv-*` is deliberate: shared mcpv-* tokens are owned by the f00102
 * shared-ui ratchet, so this script stays out of that contract.
 */
const BUILTIN_IGNORES: readonly RegExp[] = [
	/^astro-/,
	/^pagefind/,
	/^markdown-body$/,
	/^sr-only$/,
	/^mcpv-/,
];

/** A usable class token — anything else in a class attribute is skipped. */
const CLASS_TOKEN = /^[a-zA-Z][\w-]*$/;

/** `.class` tokens inside a resolved selector string. */
const SELECTOR_CLASS = /\.([a-zA-Z][\w-]*)/g;

/** Static `class="…"` / `class='…'` attributes (dynamic `{…}` never matches). */
const CLASS_ATTR = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const FRONTMATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---/;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

/**
 * At-rules whose body starts a fresh selector context (their inner
 * selectors are still collected as definitions — a `.foo` inside a mixin
 * gets included somewhere, and being permissive on DEFINED only avoids
 * false failures). Everything else (`@media`, `@supports`, `@each`, …)
 * is transparent: the parent selector stack flows through.
 */
const OPAQUE_AT_RULES = new Set([
	'font-face',
	'function',
	'keyframes',
	'mixin',
	'page',
	'property',
]);

/** Selector-context cartesian cap — keeps pathological nesting bounded. */
const MAX_CONTEXT = 512;

/** Splice point left where a `#{…}` interpolation sat in a selector. */
const INTERPOLATION_MARK = '\u0000';

export interface IStyleSourceFile {
	/** Repo-relative posix path — used in findings and waiver scopes. */
	readonly path: string;
	readonly text: string;
}

export interface IStyleWaiver {
	readonly class: string;
	/** Optional file glob (repo-relative); no scope waives everywhere. */
	readonly scope?: string;
	readonly reason: string;
}

export interface IStyleFinding {
	readonly file: string;
	readonly line?: number;
	readonly className?: string;
	readonly reason: string;
}

export interface IStyleIntegrityStats {
	readonly scssFiles: number;
	readonly astroFiles: number;
	readonly definedClasses: number;
	readonly usedClasses: number;
	readonly waived: number;
	readonly ignored: number;
}

export interface IStyleIntegrityReport {
	readonly findings: readonly IStyleFinding[];
	readonly stats: IStyleIntegrityStats;
}

export interface IStyleIntegrityPaths {
	readonly styleRoots: readonly string[];
	readonly astroRoots: readonly string[];
	readonly waiversPath: string;
}

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

/** Replace every non-newline char with a space, preserving line numbers. */
const blankPreservingLines = (text: string): string =>
	text.replace(/[^\n]/g, ' ');

const lineOf = (text: string, index: number): number => {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) {
		if (text[i] === '\n') line++;
	}
	return line;
};

/** Split a selector prelude on top-level commas (parens/brackets safe). */
export const splitSelectorList = (prelude: string): readonly string[] => {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of prelude) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			if (current.trim().length > 0) out.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim().length > 0) out.push(current.trim());
	return out;
};

/**
 * Resolve a child selector list against the parent context: `&` splices
 * the parent in place (this is what expands `&__x`/`&--x`/`&-x` into the
 * full class name); anything else nests as a descendant.
 */
const resolveSelectors = (
	parents: readonly string[],
	children: readonly string[],
): readonly string[] => {
	const out: string[] = [];
	for (const child of children) {
		const bases = parents.length > 0 ? parents : [''];
		for (const base of bases) {
			if (out.length >= MAX_CONTEXT) return out;
			out.push(
				child.includes('&')
					? child.replaceAll('&', base)
					: `${base} ${child}`.trim(),
			);
		}
	}
	return out;
};

/**
 * Brace-context scss/css parser: walks a stylesheet, expands nesting,
 * and returns every plain `.class` token the sheet defines. Handles
 * comments, strings, and `#{…}` interpolation (interpolated fragments
 * never produce class tokens across the splice point).
 */
export const extractDefinedClasses = (scss: string): ReadonlySet<string> => {
	const defined = new Set<string>();
	const stack: (readonly string[])[] = [];
	let buf = '';
	let i = 0;
	const n = scss.length;
	while (i < n) {
		const ch = scss[i];
		const next = scss[i + 1];
		if (ch === '/' && next === '*') {
			const end = scss.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}
		if (ch === '/' && next === '/') {
			const end = scss.indexOf('\n', i + 2);
			i = end === -1 ? n : end;
			continue;
		}
		if (ch === '"' || ch === "'") {
			const quote = ch;
			buf += ch;
			i++;
			while (i < n) {
				const c = scss[i];
				buf += c;
				if (c === '\\') {
					buf += scss[i + 1] ?? '';
					i += 2;
					continue;
				}
				i++;
				if (c === quote) break;
			}
			continue;
		}
		if (ch === '#' && next === '{') {
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (scss[j] === '{') depth++;
				else if (scss[j] === '}') depth--;
				j++;
			}
			// Placeholder that no class token can span — `.x-#{$y}` must
			// not define `x-` + whatever follows the interpolation.
			buf += INTERPOLATION_MARK;
			i = j;
			continue;
		}
		if (ch === '{') {
			const prelude = buf.trim();
			buf = '';
			i++;
			if (prelude.startsWith('@')) {
				const name = /^@([a-zA-Z-]+)/.exec(prelude)?.[1] ?? '';
				stack.push(
					OPAQUE_AT_RULES.has(name) ? [] : (stack.at(-1) ?? []),
				);
				continue;
			}
			const resolved = resolveSelectors(
				stack.at(-1) ?? [],
				splitSelectorList(prelude),
			);
			for (const selector of resolved) {
				for (const match of selector.matchAll(SELECTOR_CLASS)) {
					const token = match[1];
					// `.icon-#{$name}` defines dynamic classes we cannot
					// know statically — never record the literal prefix.
					const after = selector[match.index + match[0].length];
					if (token !== undefined && after !== INTERPOLATION_MARK) {
						defined.add(token);
					}
				}
			}
			stack.push(resolved);
			continue;
		}
		if (ch === '}') {
			stack.pop();
			buf = '';
			i++;
			continue;
		}
		if (ch === ';') {
			buf = '';
			i++;
			continue;
		}
		buf += ch;
		i++;
	}
	return defined;
};

export interface IAstroParts {
	/** Markup with frontmatter/style/script blanked — line numbers intact. */
	readonly markup: string;
	/** Contents of component-local `<style>` blocks (define for this file). */
	readonly styleBlocks: readonly string[];
}

export const parseAstro = (text: string): IAstroParts => {
	const styleBlocks: string[] = [];
	let markup = text.replace(FRONTMATTER, blankPreservingLines);
	markup = markup.replace(STYLE_BLOCK, (whole, css: string) => {
		styleBlocks.push(css);
		return blankPreservingLines(whole);
	});
	markup = markup.replace(SCRIPT_BLOCK, blankPreservingLines);
	return { markup, styleBlocks };
};

export interface IUsedClass {
	readonly className: string;
	readonly line: number;
}

/** Class tokens used by static `class="…"` attributes in blanked markup. */
export const extractUsedClasses = (markup: string): readonly IUsedClass[] => {
	const out: IUsedClass[] = [];
	for (const match of markup.matchAll(CLASS_ATTR)) {
		const value = match[1] ?? match[2] ?? '';
		const line = lineOf(markup, match.index);
		for (const token of value.split(/\s+/)) {
			if (CLASS_TOKEN.test(token)) out.push({ className: token, line });
		}
	}
	return out;
};

/** Minimal file glob: `**` crosses directories, `*`/`?` stay within one. */
export const globToRegExp = (glob: string): RegExp => {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const pattern = escaped
		.replace(/\*\*/g, ' ')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]')
		.replace(/ /g, '.*');
	return new RegExp(`^${pattern}$`);
};

const isBuiltinIgnored = (className: string): boolean =>
	BUILTIN_IGNORES.some((pattern) => pattern.test(className));

const checkWaiverShape = (
	entry: unknown,
	index: number,
	findings: IStyleFinding[],
): entry is IStyleWaiver => {
	const subject = `${DEFAULT_WAIVERS}[${index}]`;
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		findings.push({
			file: subject,
			reason: 'waiver must be an object: { class, scope?, reason }',
		});
		return false;
	}
	const record = entry as Record<string, unknown>;
	if (typeof record.class !== 'string' || record.class.length === 0) {
		findings.push({
			file: subject,
			reason: '"class" must be a non-empty string',
		});
		return false;
	}
	if (record.scope !== undefined && typeof record.scope !== 'string') {
		findings.push({
			file: subject,
			reason: '"scope" must be a file glob string when present',
		});
		return false;
	}
	if (
		typeof record.reason !== 'string' ||
		record.reason.trim().length < MIN_WAIVER_LENGTH
	) {
		findings.push({
			file: subject,
			reason: `"reason" must be a documented reason of at least ${MIN_WAIVER_LENGTH} characters, got ${JSON.stringify(record.reason)}`,
		});
		return false;
	}
	return true;
};

/**
 * Pure cross-check: scss definitions + per-file local definitions vs the
 * classes each .astro file uses. Waivers are honoured (and must all be
 * live — a stale waiver is itself a finding, so the file cannot rot).
 */
export const checkStyleIntegrity = (
	scssFiles: readonly IStyleSourceFile[],
	astroFiles: readonly IStyleSourceFile[],
	rawWaivers: readonly unknown[],
): IStyleIntegrityReport => {
	const findings: IStyleFinding[] = [];

	const waivers: IStyleWaiver[] = [];
	rawWaivers.forEach((entry, index) => {
		if (checkWaiverShape(entry, index, findings)) {
			waivers.push(entry as IStyleWaiver);
		}
	});
	const waiverScopes = waivers.map((waiver) =>
		waiver.scope === undefined ? undefined : globToRegExp(waiver.scope),
	);
	const usedWaivers = new Set<number>();

	const globalDefined = new Set<string>();
	for (const file of scssFiles) {
		for (const token of extractDefinedClasses(file.text)) {
			globalDefined.add(token);
		}
	}

	let usedCount = 0;
	let waivedCount = 0;
	let ignoredCount = 0;

	for (const file of astroFiles) {
		const { markup, styleBlocks } = parseAstro(file.text);
		const localDefined = new Set<string>();
		for (const block of styleBlocks) {
			for (const token of extractDefinedClasses(block)) {
				localDefined.add(token);
			}
		}
		const seen = new Set<string>();
		for (const used of extractUsedClasses(markup)) {
			if (seen.has(used.className)) continue;
			seen.add(used.className);
			usedCount++;
			if (isBuiltinIgnored(used.className)) {
				ignoredCount++;
				continue;
			}
			if (
				globalDefined.has(used.className) ||
				localDefined.has(used.className)
			) {
				continue;
			}
			const waiverIndex = waivers.findIndex(
				(waiver, index) =>
					waiver.class === used.className &&
					(waiverScopes[index] === undefined ||
						(waiverScopes[index] as RegExp).test(file.path)),
			);
			if (waiverIndex !== -1) {
				usedWaivers.add(waiverIndex);
				waivedCount++;
				continue;
			}
			findings.push({
				file: file.path,
				line: used.line,
				className: used.className,
				reason: `class "${used.className}" is used in markup but defined nowhere (global scss, shared scss, or this file's <style> block) — style it, prune it, or add a documented waiver to ${DEFAULT_WAIVERS}`,
			});
		}
	}

	waivers.forEach((waiver, index) => {
		if (!usedWaivers.has(index)) {
			findings.push({
				file: DEFAULT_WAIVERS,
				className: waiver.class,
				reason: `waiver for "${waiver.class}"${waiver.scope === undefined ? '' : ` (scope ${waiver.scope})`} matched no used-but-undefined class — remove the stale entry`,
			});
		}
	});

	return {
		findings,
		stats: {
			scssFiles: scssFiles.length,
			astroFiles: astroFiles.length,
			definedClasses: globalDefined.size,
			usedClasses: usedCount,
			waived: waivedCount,
			ignored: ignoredCount,
		},
	};
};

const walkFiles = async (
	root: string,
	extension: string,
): Promise<readonly string[]> => {
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.name === 'node_modules' || entry.name === 'dist') continue;
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkFiles(path, extension)));
		} else if (entry.isFile() && entry.name.endsWith(extension)) {
			out.push(path);
		}
	}
	return out.sort();
};

const readSources = async (
	roots: readonly string[],
	extension: string,
): Promise<readonly IStyleSourceFile[]> => {
	const files: IStyleSourceFile[] = [];
	for (const root of roots) {
		const rootAbs = abs(root);
		for (const path of await walkFiles(rootAbs, extension)) {
			files.push({
				path: relative(REPO_ROOT, path).replaceAll('\\', '/'),
				text: await readFile(path, 'utf8'),
			});
		}
	}
	return files;
};

export const detectStyleIntegrity = async (
	paths: Partial<IStyleIntegrityPaths> = {},
): Promise<IStyleIntegrityReport> => {
	const scssFiles = await readSources(
		paths.styleRoots ?? DEFAULT_STYLE_ROOTS,
		'.scss',
	);
	const astroFiles = await readSources(
		paths.astroRoots ?? DEFAULT_ASTRO_ROOTS,
		'.astro',
	);
	const waiversRaw = JSON.parse(
		await readFile(abs(paths.waiversPath ?? DEFAULT_WAIVERS), 'utf8'),
	) as unknown;
	if (!Array.isArray(waiversRaw)) {
		return {
			findings: [
				{
					file: paths.waiversPath ?? DEFAULT_WAIVERS,
					reason: 'waivers file must be a JSON array of { class, scope?, reason }',
				},
			],
			stats: {
				scssFiles: scssFiles.length,
				astroFiles: astroFiles.length,
				definedClasses: 0,
				usedClasses: 0,
				waived: 0,
				ignored: 0,
			},
		};
	}
	return checkStyleIntegrity(scssFiles, astroFiles, waiversRaw);
};

export const formatReport = (report: IStyleIntegrityReport): string => {
	const { stats } = report;
	if (report.findings.length === 0) {
		return `✓ style-integrity: ${stats.scssFiles} scss + ${stats.astroFiles} astro files scanned; ${stats.usedClasses} used classes checked against ${stats.definedClasses} defined (${stats.waived} waived, ${stats.ignored} built-in ignores).\n`;
	}
	const lines = [
		`✗ style-integrity: ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of report.findings) {
		const where =
			finding.line === undefined
				? finding.file
				: `${finding.file}:${finding.line}`;
		lines.push(`  ${where}: ${finding.reason}`);
	}
	lines.push(
		'',
		`Markup and scss are one surface: every class an .astro file renders must be styled somewhere (or carry a documented waiver in ${DEFAULT_WAIVERS}).`,
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectStyleIntegrity();
	const text = formatReport(report);
	if (report.findings.length === 0) {
		process.stdout.write(text);
		return 0;
	}
	process.stderr.write(text);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
