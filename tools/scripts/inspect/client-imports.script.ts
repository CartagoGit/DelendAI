#!/usr/bin/env bun
/**
 * client-imports.script.ts — r00030 inspection.
 *
 * Inspects every TS file under `packages/client/src/**` and
 * reports what it imports from `@mcp-vertex/core*` — by which
 * subpath, whether it's a type-only or value import, and which
 * symbols are pulled.
 *
 * Two output modes:
 *   default      → human-readable text report
 *   --json       → machine-readable counts + per-file rollup
 *
 * The companion lint (`no-core-public-types-in-client`) is what
 * enforces the migration; this script is the inspection surface
 * that quantifies progress and feeds dashboards.
 */

import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = `${import.meta.dirname ?? import.meta.dir}/../../../packages/client/src`;

interface IImportRow {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
	readonly symbols: readonly string[];
	readonly typeOnly: boolean;
}

const walk = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		const s = await fsStat(full).catch(() => null);
		if (s === null) continue;
		if (s.isDirectory()) {
			out.push(...(await walk(full)));
		} else if (
			entry.endsWith('.ts') &&
			!entry.endsWith('.spec.ts') &&
			!entry.endsWith('.test.ts')
		) {
			out.push(full);
		}
	}
	return out;
};

const RE =
	/(?:^|\s)import\s+(type\s+)?(?:\{([^}]+)\}\s+)?from\s+['"](@mcp-vertex\/core[^'"]*)['"]/g;

const inspectOne = async (file: string): Promise<readonly IImportRow[]> => {
	const text = await readFile(file, 'utf8');
	const rows: IImportRow[] = [];
	for (const [match, typeMarker, namedRaw, specifier] of text.matchAll(RE)) {
		const symbols = (namedRaw ?? '')
			.split(',')
			.map(
				(s) =>
					s
						.trim()
						.split(/\s+as\s+/)[0]
						?.trim() ?? '',
			)
			.filter((s) => s.length > 0 && s !== 'type');
		rows.push({
			file: relative(process.cwd(), file),
			line: text.slice(0, match.index ?? 0).split('\n').length,
			specifier,
			symbols,
			typeOnly: typeMarker !== undefined,
		});
	}
	return rows;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const wantJson = argv.includes('--json');
	const files = await walk(ROOT);
	const allRows: IImportRow[] = [];
	for (const file of files) {
		allRows.push(...(await inspectOne(file)));
	}
	const total = allRows.length;
	const typeOnly = allRows.filter((r) => r.typeOnly).length;
	const value = total - typeOnly;
	const bySpecifier = new Map<string, number>();
	for (const r of allRows) {
		bySpecifier.set(r.specifier, (bySpecifier.get(r.specifier) ?? 0) + 1);
	}
	if (wantJson) {
		process.stdout.write(
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					totals: { total, typeOnly, value, files: files.length },
					bySpecifier: Object.fromEntries(bySpecifier),
					rows: allRows,
				},
				null,
				2,
			) + '\n',
		);
		return 0;
	}
	process.stdout.write(`# client imports from @mcp-vertex/core*\n\n`);
	process.stdout.write(`files scanned: ${files.length}\n`);
	process.stdout.write(
		`total imports: ${total} (type: ${typeOnly}, value: ${value})\n\n`,
	);
	process.stdout.write(`## by specifier\n\n`);
	const sorted = [...bySpecifier.entries()].sort((a, b) => b[1] - a[1]);
	for (const [spec, count] of sorted) {
		process.stdout.write(`  ${count.toString().padStart(4)} ${spec}\n`);
	}
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
