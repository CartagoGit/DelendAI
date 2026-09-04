#!/usr/bin/env bun
/**
 * client-imports.script.ts — r00030 inspection.
 *
 * Inspects every TS file under `packages/client/src/**` and
 * reports what it imports from `@delendai/core*` — by which
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
	readonly typeSymbols: readonly string[];
	readonly valueSymbols: readonly string[];
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
const CORE_SPECIFIER_PREFIX = '@delendai/core';

const IMPORT_RE =
	/^import\s+([\s\S]*?)\s+from\s+['"](@delendai\/core[^'"]*)['"];?$/u;
const SIDE_EFFECT_IMPORT_RE = /^import\s+['"](@delendai\/core[^'"]*)['"];?$/u;

const pushSymbol = (bag: string[], symbol: string): void => {
	if (symbol.length > 0) bag.push(symbol);
};

const importedSymbolOf = (entry: string): string =>
	entry
		.trim()
		.replace(/^type\s+/u, '')
		.split(/\s+as\s+/u)[0]
		?.trim() ?? '';

const parseImportClause = (
	rawClause: string,
): {
	readonly typeSymbols: readonly string[];
	readonly valueSymbols: readonly string[];
} => {
	let clause = rawClause.trim();
	let clauseTypeOnly = false;
	if (clause.startsWith('type ')) {
		clauseTypeOnly = true;
		clause = clause.slice('type '.length).trim();
	}
	const typeSymbols: string[] = [];
	const valueSymbols: string[] = [];
	const push = (symbol: string, isTypeOnly: boolean): void => {
		pushSymbol(isTypeOnly ? typeSymbols : valueSymbols, symbol);
	};

	const namedMatch = clause.match(/\{([\s\S]*)\}/u);
	if (namedMatch !== null && namedMatch[1] !== undefined) {
		for (const entry of namedMatch[1].split(',')) {
			const trimmed = entry.trim();
			if (trimmed.length === 0) continue;
			push(
				importedSymbolOf(trimmed),
				clauseTypeOnly || trimmed.startsWith('type '),
			);
		}
		clause = clause.replace(namedMatch[0], '').replace(/,+/gu, ',').trim();
	}

	for (const part of clause
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)) {
		if (part.startsWith('* as ')) {
			push(part, clauseTypeOnly);
			continue;
		}
		push(importedSymbolOf(part), clauseTypeOnly);
	}

	return { typeSymbols, valueSymbols };
};

const inspectOne = async (file: string): Promise<readonly IImportRow[]> => {
	const text = await readFile(file, 'utf8');
	const rows: IImportRow[] = [];
	const lines = text.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const firstLine = lines[index]?.trimStart() ?? '';
		if (!firstLine.startsWith('import ')) continue;
		const startLine = index + 1;
		const block: string[] = [firstLine];
		while (
			!block[block.length - 1]?.includes(';') &&
			index + 1 < lines.length
		) {
			index += 1;
			block.push(lines[index]?.trim() ?? '');
		}
		const statement = block.join(' ').replace(/\s+/gu, ' ').trim();
		const importMatch = statement.match(IMPORT_RE);
		if (importMatch !== null) {
			const [, clause = '', specifier = ''] = importMatch;
			if (!specifier.startsWith(CORE_SPECIFIER_PREFIX)) continue;
			const { typeSymbols, valueSymbols } = parseImportClause(clause);
			rows.push({
				file: relative(process.cwd(), file),
				line: startLine,
				specifier,
				symbols: [...valueSymbols, ...typeSymbols],
				typeSymbols,
				valueSymbols,
				typeOnly: valueSymbols.length === 0,
			});
			continue;
		}
		const sideEffectMatch = statement.match(SIDE_EFFECT_IMPORT_RE);
		if (sideEffectMatch === null) continue;
		const [, specifier = ''] = sideEffectMatch;
		if (!specifier.startsWith(CORE_SPECIFIER_PREFIX)) continue;
		rows.push({
			file: relative(process.cwd(), file),
			line: startLine,
			specifier,
			symbols: [],
			typeSymbols: [],
			valueSymbols: [],
			typeOnly: false,
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
	const mixed = allRows.filter(
		(r) => r.typeSymbols.length > 0 && r.valueSymbols.length > 0,
	).length;
	const valueOnly = allRows.filter(
		(r) => r.valueSymbols.length > 0 && r.typeSymbols.length === 0,
	).length;
	const typeSymbolCount = allRows.reduce(
		(count, row) => count + row.typeSymbols.length,
		0,
	);
	const valueSymbolCount = allRows.reduce(
		(count, row) => count + row.valueSymbols.length,
		0,
	);
	const bySpecifier = new Map<string, number>();
	const valueBySpecifier = new Map<string, number>();
	for (const r of allRows) {
		bySpecifier.set(r.specifier, (bySpecifier.get(r.specifier) ?? 0) + 1);
		valueBySpecifier.set(
			r.specifier,
			(valueBySpecifier.get(r.specifier) ?? 0) + r.valueSymbols.length,
		);
	}
	if (wantJson) {
		process.stdout.write(
			`${JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					totals: {
						total,
						typeOnly,
						value,
						mixed,
						valueOnly,
						files: files.length,
						typeSymbols: typeSymbolCount,
						valueSymbols: valueSymbolCount,
					},
					bySpecifier: Object.fromEntries(bySpecifier),
					valueBySpecifier: Object.fromEntries(valueBySpecifier),
					rows: allRows,
				},
				null,
				2,
			)}\n`,
		);
		return 0;
	}
	process.stdout.write(`# client imports from @delendai/core*\n\n`);
	process.stdout.write(`files scanned: ${files.length}\n`);
	process.stdout.write(
		`total imports: ${total} (type-only: ${typeOnly}, value-bearing: ${value}, mixed: ${mixed}, value-only: ${valueOnly})\n`,
	);
	process.stdout.write(
		`symbols tracked: type ${typeSymbolCount}, value ${valueSymbolCount}\n\n`,
	);
	process.stdout.write(`## by specifier\n\n`);
	const sorted = [...bySpecifier.entries()].sort((a, b) => b[1] - a[1]);
	for (const [spec, count] of sorted) {
		const valueCount = valueBySpecifier.get(spec) ?? 0;
		process.stdout.write(
			`  ${count.toString().padStart(4)} ${spec} (value symbols: ${valueCount})\n`,
		);
	}
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
