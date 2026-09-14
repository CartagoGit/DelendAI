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
/**
 * The whole rule, over text rather than over a file.
 *
 * Split out so the rule can be pinned by cases. The bug below was found
 * by accident twice and could not be tested at all, because the only way
 * to ask this function anything was to edit the real barrel and read a
 * number off a lint.
 */
export const parseBarrelText = (raw: string): readonly IExport[] => {
	// Strip block comments BEFORE flattening.
	//
	// The statements are split on `;` and each one has to START with
	// `export`, so a JSDoc block sitting immediately above an export
	// became part of that statement's text and the regex stopped
	// matching — which silently removed every name in the block from the
	// inventory. Documenting an export made it disappear from the count,
	// and `lint:core-public-surface-budget` reads this list: a comment
	// was enough to move the number it gates on. Measured while adding
	// `@adopter-api` notes for x00541 S2: four exports vanished from a
	// barrel that had gained nothing but prose.
	//
	// Line comments are reduced to the tags they carry, for the same
	// reason and by the same mechanism.
	//
	// The claim that used to stand here — that a `//` comment "cannot
	// swallow the export keyword, because the newline that ends it
	// survives until the flattening below" — is false: the flattening
	// IS what removes the newline, and anything the comment contains
	// then lands in the middle of the statement. A single `;` written
	// in prose splits the statement in two, neither half starts with
	// `export`, and every name in that block leaves the inventory.
	// Measured: one explanatory comment inside one export block moved
	// the number this budget gates on from 887 to 883.
	//
	// The tags are kept because `classify` reads them off this text,
	// and only the tags: a comment cannot influence the count, and can
	// still say that an export is deprecated.
	const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
	const withoutLineComments = withoutBlockComments.replace(
		// Module specifiers in this barrel are relative paths, so `//`
		// here is always a comment and never part of a string.
		/\/\/[^\n]*/g,
		(comment) =>
			(comment.match(/@(?:deprecated|experimental)\b/g) ?? [])
				// Each surviving tag is fenced by commas so it lands in a
				// field of its own when the name list is split. Left
				// loose it would glue itself to the next name and remove
				// that export instead of annotating it — trading one way
				// of losing a name for another.
				.map((tag) => `, ${tag} ,`)
				.join(''),
	);
	// Flatten multi-line re-exports into single lines.
	const flat = withoutLineComments.replace(/\n\s*/g, ' ');
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
			// An inline `type X` inside a value block is the export `X`.
			// Counting it as "type X" was harmless while nothing read the
			// names, and wrong the moment a consumer gate started asking
			// which symbols have callers.
			.map((n) => n.replace(/^type\s+/, '').trim())
			// Whatever is left that is not an identifier is punctuation
			// or an annotation, never an export.
			.filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
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
	return parseBarrelText(raw);
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
