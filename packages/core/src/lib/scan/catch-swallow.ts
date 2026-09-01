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

const skipWhitespace = (body: string, start: number): number => {
	let index = start;
	while (index < body.length) {
		const char = body[index];
		if (char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t')
			break;
		index += 1;
	}
	return index;
};

const isCommentOnlyCatchBody = (body: string): boolean => {
	const trimmed = body.trim();
	return trimmed.startsWith('/*') && trimmed.endsWith('*/');
};

/**
 * Find empty or comment-only `catch` blocks in `body`.
 * Pure; the caller decides how to surface the findings.
 */
export const detectCatchSwallow = (
	body: string,
): readonly ICatchSwallowHit[] => {
	const out: ICatchSwallowHit[] = [];
	let searchFrom = 0;
	while (searchFrom < body.length) {
		const catchIndex = body.indexOf('catch', searchFrom);
		if (catchIndex === -1) break;
		let cursor = skipWhitespace(body, catchIndex + 'catch'.length);
		if (body[cursor] === '(') {
			const closeParen = body.indexOf(')', cursor + 1);
			if (closeParen === -1) {
				searchFrom = catchIndex + 'catch'.length;
				continue;
			}
			cursor = skipWhitespace(body, closeParen + 1);
		}
		if (body[cursor] !== '{') {
			searchFrom = catchIndex + 'catch'.length;
			continue;
		}
		const closeBrace = body.indexOf('}', cursor + 1);
		if (closeBrace === -1) {
			searchFrom = catchIndex + 'catch'.length;
			continue;
		}
		const catchBody = body.slice(cursor + 1, closeBrace);
		if (
			catchBody.trim().length === 0 ||
			isCommentOnlyCatchBody(catchBody)
		) {
			out.push({
				line: lineOf(body, catchIndex),
				snippet: body
					.slice(catchIndex, closeBrace + 1)
					.replace(/\s+/g, ' '),
			});
		}
		searchFrom = closeBrace + 1;
	}
	return out;
};
