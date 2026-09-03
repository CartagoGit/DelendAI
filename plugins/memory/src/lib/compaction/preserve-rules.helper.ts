/**
 * preserve-rules.ts — the half of automatic compaction that makes it
 * safe to run without being asked (q00014 S6).
 *
 * `compaction-trigger.ts` already answers *when* to compact. It says
 * nothing about *what a summary is not allowed to lose*, and that gap
 * is the whole risk: a compaction that silently drops a constraint the
 * user gave hours ago does not look like a failure. It looks like a
 * shorter context. The agent then re-litigates a settled decision, or
 * violates a boundary nobody remembers being set, and the only trace
 * is that the conversation got smaller.
 *
 * So compaction gets a second gate. `extractLoadBearing` reads the
 * material about to be compacted and names the fragments that must
 * survive; `verifySummaryPreserves` checks a proposed summary against
 * that list and reports what it dropped. Both are pure — no clock, no
 * I/O — so the check is free to run on every compaction.
 *
 * The bias is deliberate and one-directional: over-preserving costs a
 * few tokens, under-preserving costs the user's decision. Where the
 * classification is unsure, it preserves.
 */

import type {
	IPreserveCategory,
	IPreservedFragment,
	IPreserveVerdict,
} from '../contracts/interfaces/preserve-rules.interface';

/**
 * Modal verbs that mark a boundary rather than a suggestion, in the two
 * languages this project is actually conducted in. "should" is absent
 * on purpose: it is advisory in both, and treating advice as a
 * constraint would preserve most of every conversation.
 */
const CONSTRAINT_PATTERN =
	/\b(must|never|always|only|forbidden|required|debe|debes|nunca|siempre|jamás|jamas|obligatorio|prohibido)\b/iu;

/**
 * Phrasing that marks a settled choice. A decision differs from an
 * opinion in that someone acted on it.
 */
const DECISION_PATTERN =
	/\b(decided|decision|we will|we won't|chose|choosing|agreed|approved|rejected|decidido|decidimos|hemos decidido|elegimos|acordado|aprobado|rechazado)\b/iu;

/**
 * Phrasing that marks an established cause. "Probably" and "maybe" are
 * excluded below — a guess is not a diagnosis, and preserving guesses
 * as if they were findings is how a wrong theory outlives its evidence.
 */
const CAUSE_PATTERN =
	/\b(root cause|because|caused by|the cause|turns out|it was|causa raíz|causa raiz|porque|la causa|resulta que|se debe a)\b/iu;

const HEDGE_PATTERN =
	/\b(probably|maybe|might|perhaps|possibly|seems|quizá|quiza|quizás|quizas|puede que|tal vez|parece que)\b/iu;

/**
 * Identifiers a summary must carry verbatim, because they are the only
 * way back to the thing they name. A paraphrased SHA is useless.
 *
 * Covered: commit SHAs (7+ hex), this repo's proposal ids (a letter and
 * five digits), repo-relative file paths, long CLI flags, and dotted
 * config keys.
 */
const IDENTIFIER_PATTERNS: readonly RegExp[] = [
	/\b[0-9a-f]{7,40}\b/gu,
	/\b[a-z]\d{5}\b/gu,
	/\b[\w.-]+\/[\w./-]+\.[a-z]{2,5}\b/gu,
	/(?<=\s|^)--[a-z][\w-]*/gu,
	/\b[a-z][\w-]*(?:\.[a-z][\w-]*){2,}\b/gu,
];

/** Collapse whitespace and case so two spellings of one fact compare equal. */
const normalise = (text: string): string =>
	text.replace(/\s+/gu, ' ').trim().toLowerCase();

const classify = (line: string): IPreserveCategory | undefined => {
	if (CONSTRAINT_PATTERN.test(line)) return 'user-constraint';
	if (DECISION_PATTERN.test(line)) return 'user-decision';
	if (CAUSE_PATTERN.test(line) && !HEDGE_PATTERN.test(line)) {
		return 'diagnosed-cause';
	}
	return undefined;
};

/**
 * Read the material about to be compacted and name what must survive.
 *
 * Sentences are classified whole rather than by keyword, so "we must
 * never push to develop" is preserved as the sentence a reader can act
 * on, not as the word "never".
 */
export const extractLoadBearing = (
	source: string,
): readonly IPreservedFragment[] => {
	const fragments: IPreservedFragment[] = [];
	const seen = new Set<string>();
	const push = (
		category: IPreserveCategory,
		text: string,
		sourceLine: number,
	): void => {
		const key = `${category}:${normalise(text)}`;
		if (text.trim().length === 0 || seen.has(key)) return;
		seen.add(key);
		fragments.push({ category, text: text.trim(), sourceLine });
	};

	const lines = source.split('\n');
	for (const [index, line] of lines.entries()) {
		const lineNumber = index + 1;
		const category = classify(line);
		if (category !== undefined) {
			push(category, line, lineNumber);
		}
		// Identifiers are extracted from EVERY line, not only classified
		// ones: a SHA mentioned in passing is still the only way back to
		// that commit.
		for (const pattern of IDENTIFIER_PATTERNS) {
			for (const match of line.matchAll(pattern)) {
				push('identifier', match[0], lineNumber);
			}
		}
	}
	return fragments;
};

/**
 * Check a proposed summary against what the source said must survive.
 *
 * Matching is on the normalised fragment, so the summary may rewrite
 * around it freely; what it may not do is drop it. For a whole
 * sentence, carrying it verbatim is one way to pass, but so is
 * carrying the same content — hence the fallback to the sentence's
 * distinctive words rather than the sentence itself.
 */
export const verifySummaryPreserves = (input: {
	readonly source: string;
	readonly summary: string;
}): IPreserveVerdict => {
	const required = extractLoadBearing(input.source);
	const haystack = normalise(input.summary);
	const dropped = required.filter((fragment) => {
		const needle = normalise(fragment.text);
		if (haystack.includes(needle)) return false;
		if (fragment.category === 'identifier') {
			// An identifier is verbatim or it is lost. No paraphrase of
			// a SHA or a path leads anywhere.
			return true;
		}
		// A sentence may be rewritten. Require its distinctive words —
		// the ones that carry the meaning, not the grammar — to survive.
		//
		// The word that TRIGGERED the classification is excluded: it is
		// the grammar of the category, not its content, and a faithful
		// rewrite changes it every time ("the user decided X" becomes
		// "Decision: X"). Counting it would fail exactly the summaries
		// that did their job.
		const distinctive = needle
			.split(' ')
			.filter(
				(word) =>
					word.length >= 5 &&
					!CONSTRAINT_PATTERN.test(word) &&
					!DECISION_PATTERN.test(word) &&
					!CAUSE_PATTERN.test(word),
			);
		if (distinctive.length === 0) return true;
		const kept = distinctive.filter((word) => haystack.includes(word));
		return kept.length / distinctive.length < 0.6;
	});

	return {
		ok: dropped.length === 0,
		dropped,
		required,
		nextAction:
			dropped.length === 0
				? 'Summary is safe to use: every load-bearing fragment survived.'
				: `Do NOT replace the context with this summary. It drops ${String(dropped.length)} load-bearing fragment(s): ${dropped
						.slice(0, 5)
						.map(
							(f) =>
								`${f.category} @line ${String(f.sourceLine)}`,
						)
						.join(
							', ',
						)}. Rewrite the summary to carry them, then re-check.`,
	};
};
