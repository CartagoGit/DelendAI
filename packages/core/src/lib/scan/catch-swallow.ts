/**
 * catch-swallow.ts — empty `catch` block detection (c00126 S1).
 *
 * Detects the Clean Code violation where a `try` block is followed by
 * an empty `catch {}` or a `catch` whose body is a single comment
 * (no real handling).
 */
import { lineOf } from './text-utils';

export interface ICatchSwallowHit {
	readonly line: number;
	readonly snippet: string;
}

/**
 * Find empty or comment-only `catch` blocks in `body`.
 * Pure; the caller decides how to surface the findings.
 */
export const detectCatchSwallow = (
	body: string,
): readonly ICatchSwallowHit[] => {
	const out: ICatchSwallowHit[] = [];
	const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
	let m: RegExpExecArray | null;
	while ((m = emptyCatch.exec(body)) !== null) {
		out.push({
			line: lineOf(body, m.index),
			snippet: m[0].replace(/\s+/g, ' '),
		});
	}
	const nothingCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\/\*[^*]*\*\/\s*\}/g;
	while ((m = nothingCatch.exec(body)) !== null) {
		out.push({
			line: lineOf(body, m.index),
			snippet: m[0].replace(/\s+/g, ' '),
		});
	}
	return out;
};
