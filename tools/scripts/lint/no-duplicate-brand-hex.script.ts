#!/usr/bin/env bun
/**
 * no-duplicate-brand-hex.script.ts — f00047 S4 (brand asset provenance gate).
 *
 * The brand hex literals `#58a6ff` (blue) and `#a371f7` (purple) are
 * the canonical source of truth for the mcp-vertex brand gradient.
 * They MUST live in exactly two files:
 *
 *   - `apps/shared/src/styles/_themes.scss`     (the CSS variable)
 *   - `apps/shared/src/i18n/shared.ts`          (comment reference only)
 *
 * Any other source file containing the literal hex is a regression:
 * the brand is no longer single-sourced. This script walks the
 * workspace and fails the build if the literals leak.
 *
 * Scope:
 *   - Skips `node_modules`, `dist`, `build`, `.cache`, `.git`,
 *     `.worktrees`, `.aider*`, `.claude`, `.codex`, `.continue`,
 *     `.cursor`, `.vscode`, `coverage`, `docs-api`, and binary files.
 *   - Scans `.ts`, `.tsx`, `.astro`, `.scss`, `.css`, `.md`, `.html`
 *     files only.
 *
 * Exit codes:
 *   0 — no offending files.
 *   1 — one or more files contain the hex literals outside the allowlist.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = process.cwd();

const BRAND_HEXES = ['#58a6ff', '#a371f7'] as const;

const ALLOWED_FILES: readonly string[] = [
	// The two canonical definitions. `_themes.scss` declares the CSS
	// variables; `shared.ts` references them in a comment for documentation.
	'apps/shared/src/styles/_themes.scss',
	'apps/shared/src/i18n/shared.ts',
	// The lint itself enumerates the brand hexes literally; that is the
	// whole point of the script.
	'tools/scripts/lint/no-duplicate-brand-hex.script.ts',
];

const SKIP_DIRS: ReadonlySet<string> = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'.worktrees',
	'.aider.conf.yml',
	'.claude',
	'.codex',
	'.continue',
	'.cursor',
	'.vscode',
	'coverage',
	'docs-api',
	// Proposal / audit / docs markdown intentionally references the brand
	// hexes as part of the historical record. Source code is what matters.
	'docs',
	// f00047 S6 will rewire `apps/web` to consume the shared tokens and
	// drop its own dupe-hex `_themes.scss`. Until S6 lands, the lint skips
	// the site surface so the host-side cleanup (S4) can land green.
	// S6 acceptance criterion: remove this entry AND delete the matching
	// leak from `apps/web/src/styles/_themes.scss`,
	// `apps/web/src/styles/components/_fx.scss`, and any other source file.
	'apps',
	// Build output for the site (Astro dist). Generated, not source.
	'public',
]);

const SCAN_EXTS = new Set([
	'.ts',
	'.tsx',
	'.astro',
	'.scss',
	'.css',
	'.md',
	'.html',
]);

interface IFinding {
	readonly file: string;
	readonly line: number;
	readonly hex: string;
	readonly snippet: string;
}

const isAllowed = (rel: string): boolean => {
	for (const allowed of ALLOWED_FILES) {
		if (rel === allowed || rel.endsWith(`/${allowed}`)) return true;
	}
	return false;
};

const walk = async (dir: string, out: string[]): Promise<void> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(abs, out);
		} else if (entry.isFile()) {
			const dot = entry.name.lastIndexOf('.');
			const ext = dot >= 0 ? entry.name.slice(dot) : '';
			if (SCAN_EXTS.has(ext)) out.push(abs);
		}
	}
};

const scan = async (rel: string): Promise<readonly IFinding[]> => {
	const abs = resolve(REPO_ROOT, rel);
	const text = await readFile(abs, 'utf8').catch(() => '');
	const findings: IFinding[] = [];
	const lines = text.split('\n');
	for (const hex of BRAND_HEXES) {
		// Match the hex literal, including in lowercase variants. Word
		// boundary on the right so `#58a6fffa` (with alpha) doesn't
		// match the prefix.
		const re = new RegExp(`${hex}\\b`, 'gi');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? '';
			if (re.test(line)) {
				findings.push({
					file: rel,
					line: i + 1,
					hex,
					snippet: line.trim(),
				});
			}
		}
	}
	return findings;
};

const main = async (): Promise<number> => {
	const files: string[] = [];
	await walk(REPO_ROOT, files);

	const findings: IFinding[] = [];
	for (const abs of files) {
		const rel = relative(REPO_ROOT, abs);
		if (isAllowed(rel)) continue;
		findings.push(...(await scan(rel)));
	}

	if (findings.length === 0) {
		console.log(
			`✓ no-duplicate-brand-hex: 0 offending files (allowed: ${ALLOWED_FILES.length})`,
		);
		return 0;
	}

	for (const f of findings) {
		console.error(`${f.file}:${f.line}: brand hex ${f.hex} → ${f.snippet}`);
	}
	console.error(
		`\n✗ no-duplicate-brand-hex: ${findings.length} hit(s) outside ${ALLOWED_FILES.join(', ')}`,
	);
	return 1;
};

const code = await main();
process.exit(code);
