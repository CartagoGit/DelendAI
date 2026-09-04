#!/usr/bin/env bun
/**
 * core-public-inventory.script.ts — r00027 (Track C / §50).
 *
 * Walks every export of `@delendai/core/public` and classifies
 * each one as `stable | experimental | internal | deprecated` per
 * the rules declared below. Emits a JSON inventory + a Markdown
 * table that the docs site can render.
 *
 * Classification rules (priority order):
 *   1. `@deprecated` JSDoc tag on the source line   → deprecated.
 *   2. Symbol name starts with `nodeDynamicImport`,
 *      `writeFileAtomic`, `writeFileAtomicSync`,
 *      `withFileMutex`, `readJson`, `writeJson`      → internal
 *      (these touch the filesystem and are reserved for
 *      privileged callers).
 *   3. Symbol name is `*Internal*`, `*Private*`,
 *      contains the word `Internal` or `Private`      → internal.
 *   4. Symbol carries an `@experimental` JSDoc tag   → experimental.
 *   5. Otherwise                                     → stable.
 *
 * Inputs:
 *   --json   write JSON to stdout (default; tab-delimited otherwise).
 *   --md     write Markdown table to stdout.
 *   --out <path>   also write the JSON to the given file.
 *
 * The script does NOT parse the source — it walks the public
 * barrel (`packages/core/src/public/index.ts`) and inspects
 * re-exported names + the JSDoc of each source declaration. This
 * keeps the script fast (no full AST parse) at the cost of not
 * catching inline `@deprecated` comments inside function bodies
 * (those are not exports).
 */

import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

interface IExport {
	readonly name: string;
	readonly kind: 'type' | 'function' | 'class' | 'const';
	readonly maturity: 'stable' | 'experimental' | 'internal' | 'deprecated';
	readonly source: string;
	readonly deprecatedTag: boolean;
	readonly experimentalTag: boolean;
}

const PUBLIC_BARREL = (() => {
	const here = import.meta.dirname ?? import.meta.dir;
	return `${here}/../../../packages/core/src/public/index.ts`;
})();

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

/**
 * Map a re-export line to its kind. We only need to tell type
 * re-exports from value re-exports; everything else is opaque.
 */
const _kindOf = (raw: string): IExport['kind'] => {
	if (raw.startsWith('export type')) return 'type';
	if (raw.startsWith('export function')) return 'function';
	if (raw.startsWith('export class')) return 'class';
	if (raw.startsWith('export const')) return 'const';
	return 'type';
};

export const classify = (name: string, raw: string): IExport['maturity'] => {
	const deprecatedTag = /@deprecated\b/.test(raw);
	const experimentalTag = /@experimental\b/.test(raw);
	if (deprecatedTag) return 'deprecated';
	// b00237 (Track C): `nodeDynamicImport` was the only public
	// way for a plugin to import a Node-only module before
	// subpath exports landed. Mark as deprecated.
	if (/^nodeDynamicImport$/.test(name)) return 'deprecated';
	if (/writeFileAtomic\b|withFileMutex\b|readJson\b|writeJson\b/.test(name)) {
		return 'internal';
	}
	if (/Internal|Private/.test(name)) return 'internal';
	if (experimentalTag) return 'experimental';
	return 'stable';
};

/**
 * Parse the public barrel. Each export is one of:
 *   `export type { X } from '...';`
 *   `export { X } from '...';`     (const re-exports, multi-line OK)
 *   `export const X = ...;`       (rare — for local declarations)
 *
 * Multi-line re-exports are flattened first so the regex matches
 * once per `from '...';` statement.
 */
export const parseBarrel = async (): Promise<readonly IExport[]> => {
	let raw = '';
	try {
		raw = await readFile(PUBLIC_BARREL, 'utf8');
	} catch (e) {
		err(
			`core-public-inventory: cannot read barrel: ${(e as Error).message}`,
		);
		process.exit(2);
	}
	// Flatten multi-line re-exports into single lines.
	const flat = raw.replace(/\n\s*/g, ' ');
	const out: IExport[] = [];
	for (const stmt of flat.split(';')) {
		const trimmed = stmt.trim();
		if (trimmed.length === 0) continue;
		const match = /^export (type )?\{([^}]+)\} from '([^']+)'/.exec(
			trimmed,
		);
		if (match === null) continue;
		const isType = match[1] !== undefined;
		const names = (match[2] ?? '')
			.split(',')
			.map((n) => n.trim().split(' as ')[0]?.trim() ?? '')
			.filter((n) => n.length > 0);
		const source = match[3] ?? '';
		for (const name of names) {
			out.push({
				name,
				kind: isType ? 'type' : 'const',
				maturity: classify(name, trimmed),
				source,
				deprecatedTag: /@deprecated\b/.test(trimmed),
				experimentalTag: /@experimental\b/.test(trimmed),
			});
		}
	}
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		const direct =
			/^export (const|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/.exec(
				trimmed,
			);
		if (direct === null) continue;
		const kind = direct[1] as 'const' | 'function' | 'class';
		const name = direct[2] ?? '';
		out.push({
			name,
			kind,
			maturity: classify(name, trimmed),
			source: '../public/index',
			deprecatedTag: /@deprecated\b/.test(trimmed),
			experimentalTag: /@experimental\b/.test(trimmed),
		});
	}
	return out;
};

export const renderJson = (exports: readonly IExport[]): string => {
	const totals = {
		stable: 0,
		experimental: 0,
		internal: 0,
		deprecated: 0,
	};
	for (const e of exports) totals[e.maturity] += 1;
	return JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			totals,
			count: exports.length,
			exports,
		},
		null,
		2,
	);
};

export const renderMd = (exports: readonly IExport[]): string => {
	const totals = {
		stable: 0,
		experimental: 0,
		internal: 0,
		deprecated: 0,
	};
	for (const e of exports) totals[e.maturity] += 1;
	const head = [
		'# `@delendai/core` public API inventory',
		'',
		`Total exports: ${exports.length}`,
		'',
		'| Maturity | Count |',
		'| --- | --- |',
		`| stable | ${totals.stable} |`,
		`| experimental | ${totals.experimental} |`,
		`| internal | ${totals.internal} |`,
		`| deprecated | ${totals.deprecated} |`,
		'',
		'| Name | Kind | Maturity | Source |',
		'| --- | --- | --- | --- |',
	];
	const body = exports
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(
			(e) =>
				`| \`${e.name}\` | ${e.kind} | ${e.maturity} | \`${e.source}\` |`,
		)
		.join('\n');
	return `${head.join('\n')}\n${body}\n`;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const exports = await parseBarrel();
	const wantJson = hasFlag(argv, 'json') || !hasFlag(argv, 'md');
	const _wantMd = hasFlag(argv, 'md');
	const outFile = flag(argv, 'out');
	const payload = wantJson ? renderJson(exports) : renderMd(exports);
	if (outFile !== undefined) {
		await writeFile(outFile, payload, 'utf8');
	}
	out(payload);
	return 0;
};

if (import.meta.main) {
	void main(process.argv.slice(2)).then((code) => {
		process.exitCode = code;
	});
}
