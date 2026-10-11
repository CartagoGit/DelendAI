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
 * and `sr-only` (injected utility hooks), and `delendai-*` — shared delendai-*
 * tokens are owned by the f00102 shared-ui ratchet (lint:shared-ui-ratchet),
 * which is the authoritative gate for shared-component classes.
 */
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

import {
	extractDefinedClasses,
	extractUsedClasses,
	globToRegExp,
	parseAstro,
	splitSelectorList,
} from '@delendai/style-convention/public';

export {
	extractDefinedClasses,
	extractUsedClasses,
	globToRegExp,
	parseAstro,
	splitSelectorList,
} from '@delendai/style-convention/public';
export type {
	IAstroParts,
	IUsedClass,
} from '@delendai/style-convention/public';

// c00088: resolved from the git worktree, NOT process.cwd() — a
// cwd-derived root relativized findings as `../apps/…` when the suite
// ran from tools/, so they stopped matching the repo-relative waivers.
const REPO_ROOT = repoRoot();
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
 * `delendai-*` is deliberate: shared delendai-* tokens are owned by the f00102
 * shared-ui ratchet, so this script stays out of that contract.
 */
const BUILTIN_IGNORES: readonly RegExp[] = [
	/^astro-/,
	/^pagefind/,
	/^markdown-body$/,
	/^sr-only$/,
	/^delendai-/,
];

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
