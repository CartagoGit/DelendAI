/**
 * magic-numbers.ts — bare numeric literal detection (c00126 S1).
 *
 * A "magic number" is a numeric literal that appears inline in code
 * without being declared as a `const` in the same file. The
 * `MAGIC_WHITELIST` covers common non-magic values (0, 1, -1, etc.)
 * to keep the signal-to-noise ratio high.
 */
import { lineOf } from './text-utils';

/** Values that are NOT magic numbers. */
export const MAGIC_WHITELIST: ReadonlySet<string> = new Set([
	'0',
	'1',
	'-1',
	'2',
	'100',
	'1000',
	'0xFF',
	'0xff',
	'0x0',
	'0b0',
	'0b1',
	'60',
	'90',
]);

export interface IMagicNumberHit {
	readonly line: number;
	readonly value: string;
	readonly snippet: string;
}

/**
 * Find bare numeric literals in `body` that are not on a `const`
 * declaration line and not on a `.length` / `.size` access line.
 */
export const detectMagicNumbers = (
	body: string,
): readonly IMagicNumberHit[] => {
	const out: IMagicNumberHit[] = [];
	const literalRegex = /(?<![\w.])(\d{2,})(?![\w])/g;
	while (true) {
		const m = literalRegex.exec(body);
		if (m === null) break;
		const value = m[1] ?? '';
		if (MAGIC_WHITELIST.has(value)) continue;
		const lineStart = body.lastIndexOf('\n', m.index) + 1;
		const lineEnd = body.indexOf('\n', m.index);
		const line = body.slice(
			lineStart,
			lineEnd === -1 ? body.length : lineEnd,
		);
		// Skip comments: a numeric literal in a comment/docstring is prose,
		// not a magic number in code (e.g. "the last 50 calls").
		const trimmed = line.trim();
		if (
			trimmed.startsWith('//') ||
			trimmed.startsWith('*') ||
			trimmed.startsWith('/*')
		) {
			continue;
		}
		if (/\bconst\b/.test(line) && /=\s*\d/.test(line)) continue;
		if (/\.length\b/.test(line)) continue;
		if (/\.size\b/.test(line)) continue;
		out.push({
			line: lineOf(body, m.index),
			value,
			snippet: line.trim().slice(0, 120),
		});
	}
	return out;
};
