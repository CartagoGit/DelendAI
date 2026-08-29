/**
 * long-chains.ts — long switch / else-if detection (c00126 S1).
 *
 * Detects two anti-patterns that the §7.1 #12 rule explicitly forbids
 * routing through a registry:
 *   - switch statements with many case branches
 *   - chains of else if arms
 *
 * Pure: takes the source body string, returns findings.
 */
import { lineOf } from './text-utils';

export type ChainKind = 'switch' | 'else-if';

export interface ILongChainHit {
	readonly line: number;
	readonly arms: number;
	readonly snippet: string;
	readonly kind: ChainKind;
}

export interface ILongChainsOptions {
	/** Minimum arms to flag. Default 5. */
	readonly minArms?: number;
}

/**
 * Find switch statements and else-if chains with many arms.
 * Pure; the caller decides the threshold.
 */
export const detectLongChains = (
	body: string,
	options: ILongChainsOptions = {},
): readonly ILongChainHit[] => {
	const minArms = options.minArms ?? 5;
	const out: ILongChainHit[] = [];
	// Match switches with `case`
	const switchRegex = /\bswitch\s*\([^)]*\)\s*\{/g;
	let m: RegExpExecArray | null;
	m = switchRegex.exec(body);
	while (m !== null) {
		const start = m.index + m[0].length;
		// Find matching closing brace (single-level aware; nested switches are rare)
		let depth = 1;
		let i = start;
		while (i < body.length && depth > 0) {
			const ch = body[i];
			if (ch === '{') depth += 1;
			else if (ch === '}') depth -= 1;
			i += 1;
		}
		const block = body.slice(start, i - 1);
		const cases = block.match(/\bcase\s+[^:]+:/g) ?? [];
		if (cases.length >= minArms) {
			out.push({
				line: lineOf(body, m.index),
				arms: cases.length,
				snippet: `switch with ${cases.length} case branches`,
				kind: 'switch',
			});
		}
		m = switchRegex.exec(body);
	}
	// Match chains of `else if` at indentation 0
	const elseIfRegex = /\belse\s+if\s*\(/g;
	const elseIfHits: Array<{ line: number; idx: number }> = [];
	m = elseIfRegex.exec(body);
	while (m !== null) {
		elseIfHits.push({ line: lineOf(body, m.index), idx: m.index });
		m = elseIfRegex.exec(body);
	}
	// Coalesce: consecutive `else if` branches (no intervening `}`-then-new-statement).
	for (let i = 0; i < elseIfHits.length; i += 1) {
		const here = elseIfHits[i];
		if (!here) continue;
		let arms = 1;
		let prev = here.idx;
		for (let j = i + 1; j < elseIfHits.length; j += 1) {
			const next = elseIfHits[j];
			if (!next) continue;
			const between = body.slice(prev, next.idx);
			if (between.length > 200) break;
			if (/^\s*return\b/.test(between)) break;
			if (/^\s*}\s*$/.test(between)) break;
			arms += 1;
			prev = next.idx;
		}
		if (arms >= minArms) {
			out.push({
				line: here.line,
				arms,
				snippet: `chain of ${arms} else if branches`,
				kind: 'else-if',
			});
			i += arms - 1;
		}
	}
	return out;
};
