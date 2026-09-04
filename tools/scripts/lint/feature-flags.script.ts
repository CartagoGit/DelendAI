#!/usr/bin/env bun
/**
 * feature-flags.script.ts — f00152 S5 (L3 — feature flags lint).
 *
 * Verifies the catalog at `docs/mcp-vertex/api/feature-flags.md` is
 * well-formed (every entry has name, sinceVersion, defaultValue,
 * removalVersion, description). The lint does NOT scan source for
 * flag *usage* — that is the responsibility of the proposal that
 * introduces each flag. This lint enforces the catalog shape so the
 * docs site can render it without errors.
 *
 * SOLID notes:
 *   - **Pure over inputs** (`parseFeatureFlagCatalog`): given the
 *     markdown text, returns a typed list. No I/O.
 *   - **Adapter for disk**: `readFeatureFlagCatalog` reads the file.
 *   - **CLI wrapper**: prints the verdict and exits.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const CATALOG_REL = 'docs/mcp-vertex/api/feature-flags.md';

/** Row-shaped mirror of `IFeatureFlagEntry`. Kept structural; the runtime type is in `@delendai/core/public`. */
export interface IFeatureFlagCatalogEntry {
	readonly name: string;
	readonly sinceVersion: string;
	readonly defaultValue: boolean;
	readonly removalVersion: string;
	readonly description: string;
}

/** Verdict the pure parser returns. */
export interface IFeatureFlagCatalogVerdict {
	readonly ok: boolean;
	readonly entries: readonly IFeatureFlagCatalogEntry[];
	readonly errors: readonly string[];
}

/**
 * Parse the catalog's markdown table. Pure over the input string.
 * The table rows look like:
 *
 *   | `name` | 0.1.0 | `true` | 0.3.0 | description |
 *
 * Anything that doesn't match is reported in `errors` and the row is
 * skipped (so a malformed row does not cascade into a CI red that
 * hides the real problem).
 */
export const parseFeatureFlagCatalog = (
	markdown: string,
): IFeatureFlagCatalogVerdict => {
	const lines = markdown.split(/\r?\n/);
	const entries: IFeatureFlagCatalogEntry[] = [];
	const errors: string[] = [];
	let inTable = false;
	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('|')) {
			inTable = false;
			continue;
		}
		if (!inTable) {
			inTable = true;
			continue;
		}
		if (/^\|\s*-+\s*\|/.test(trimmed)) continue; // table header divider
		const cells = trimmed
			.split('|')
			.map((cell) => cell.trim())
			.filter((cell) => cell.length > 0);
		if (cells.length < 5) {
			errors.push(
				`line ${index + 1}: expected 5 cells, got ${cells.length}`,
			);
			continue;
		}
		const [nameCell, sinceCell, defaultCell, removalCell, ...rest] = cells;
		if (
			nameCell === undefined ||
			sinceCell === undefined ||
			defaultCell === undefined ||
			removalCell === undefined
		) {
			errors.push(`line ${index + 1}: incomplete feature flag row`);
			continue;
		}
		const name = (nameCell.match(/`([^`]+)`/) ?? [])[1] ?? '';
		if (name === '') {
			errors.push(`line ${index + 1}: missing flag name`);
			continue;
		}
		const sinceVersion = sinceCell;
		const defaultValue = parseBooleanLiteral(defaultCell);
		if (defaultValue === null) {
			errors.push(
				`line ${index + 1}: defaultValue must be \`true\` or \`false\``,
			);
			continue;
		}
		const removalVersion = removalCell;
		const description = rest.join(' | ');
		entries.push({
			name,
			sinceVersion,
			defaultValue,
			removalVersion,
			description,
		});
	}
	return { ok: errors.length === 0, entries, errors };
};

const parseBooleanLiteral = (cell: string): boolean | null => {
	const match = cell.match(/^`?(true|false)`?$/i);
	if (match === null) return null;
	return match[1]?.toLowerCase() === 'true';
};

const readCatalog = (): string => {
	const abs = join(REPO_ROOT, CATALOG_REL);
	if (!existsSync(abs)) {
		throw new Error(`feature-flag catalog not found at ${CATALOG_REL}`);
	}
	return readFileSync(abs, 'utf8');
};

const main = (): number => {
	let markdown: string;
	try {
		markdown = readCatalog();
	} catch (err) {
		process.stderr.write(
			`[feature-flags] ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}
	const verdict = parseFeatureFlagCatalog(markdown);
	if (!verdict.ok) {
		for (const error of verdict.errors) {
			process.stderr.write(`[feature-flags] ${error}\n`);
		}
		process.stderr.write(
			`[feature-flags] catalog at ${CATALOG_REL} has ${verdict.errors.length} malformed row(s)\n`,
		);
		return 1;
	}
	process.stdout.write(
		`✓ feature-flags: ${verdict.entries.length} flag(s) catalogued at ${CATALOG_REL}\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
