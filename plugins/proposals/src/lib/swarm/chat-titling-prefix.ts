/**
 * chat-titling-prefix.ts
 *
 * Parser for the first prompt of an the host project orchestrator chat.
 *
 * Background:
 *   VS Code Copilot derives each chat's title from the first message sent
 *   to the model. The today/archived sidebar in the Copilot panel shows
 *   that title; without a stable convention, the host project sessions appear as
 *   ad-hoc fragments ("¿qué…", "Tarea:…") and become impossible to
 *   distinguish without opening the chat.
 *
 *   The convention adopted by `.github/agents/orchestrator.agent.md` is:
 *
 *     With active proposal:    [<proposalId>] T<taskId>: <short summary>
 *     Without active proposal: [FREE] <short summary>
 *
 *   The visible prefix (everything before the first `:` in the proposal
 *   case, or the full `[FREE] ...` text in the free case) must fit in
 *   `CHAT_TITLING_PREFIX_MAX_LENGTH` characters (40) so the sidebar
 *   does not truncate the proposal id / task id.
 *
 *   This module exposes:
 *     - `parseChatTitlingPrefix(input)`: full structural result.
 *     - `isValidChatTitlingPrefix(input)`: boolean wrapper derived from
 *       `parseChatTitlingPrefix(input).valid`.
 *
 *   It owns no I/O, no clock access, and no Zod runtime validation: the
 *   input is a string, the output is a pure-data interface. That keeps
 *   the helper testable and cheap to call from the gate prompt in T3
 *   without pulling extra dependencies.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum length (in characters) of the visible prefix that VS Code's
 * today/archived sidebar will show. Anything longer is truncated and the
 * proposal id / task id can drop out of view.
 *
 * Empirically the sidebar shows ~50 chars before ellipsis, but a margin
 * of 10 keeps the title human-readable on narrower viewports.
 */
export const CHAT_TITLING_PREFIX_MAX_LENGTH = 40;

/**
 * Minimum length of the summary portion (non-whitespace characters) for
 * the `[FREE]` form. A shorter summary makes the chat title meaningless
 * in the sidebar.
 */
const FREE_SUMMARY_MIN_NON_WHITESPACE = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The three kinds a chat-titling prefix can be classified as.
 *
 *   - `proposal`: the prefix is bound to an active proposal id, with
 *     a `T<taskId>` segment and a colon-delimited summary.
 *   - `free`: the prefix uses the literal `[FREE]` marker; there is no
 *     `T<taskId>` segment and the whole text after `[FREE] ` is the
 *     summary.
 *   - `invalid`: the input does not satisfy the convention. The
 *     `reason` field carries a short human-readable diagnostic.
 */
export type IChatTitlingPrefixKind = 'proposal' | 'free' | 'invalid';

/**
 * Structured parse result for `parseChatTitlingPrefix`.
 *
 * Fields are populated only when their semantic value exists:
 *   - `proposalId` and `taskId` are present for `kind === 'proposal'`.
 *   - `summary` is present for `kind === 'proposal'` and `kind === 'free'`.
 *   - `reason` is present for `kind === 'invalid'`.
 *   - `raw` always echoes the trimmed input that was parsed.
 *
 * The interface uses `readonly` on every field so callers cannot
 * accidentally mutate the result. The proposal design rule that
 * `I`-prefixed interfaces carry `readonly` members is preserved here.
 */
export interface IChatTitlingPrefixResult {
	readonly valid: boolean;
	readonly kind: IChatTitlingPrefixKind;
	readonly proposalId?: string;
	readonly taskId?: string;
	readonly summary?: string;
	readonly raw: string;
	readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Regex catalogue
// ---------------------------------------------------------------------------
//
// We build the two proposals regexes by hand and document each piece.
//
// (1) PROPOSAL_PREFIX
//     Captures inside the brackets, then a literal "]" + space, then the
//     `T<id>` segment. Summary is captured separately in
//     `PROPOSAL_FULL` so we can apply the length cap before the first
//     `:` independently of the summary text.
//
//     Bracket content: a family letter followed by one or more digits,
//     optionally followed by `-` and one or more alphanumerics.
//       e.g. p12, f3, p12-add-login
//     We intentionally forbid:
//       - leading zeros ("p022") — to keep the prefix predictable.
//       - uppercase ("P22") — the convention is lowercase.
//       - suffixes that are not letter/digit ("p22!").
//
// (2) PROPOSAL_FULL
//     Composes PROPOSAL_PREFIX with a "T<id>:" segment and a summary.
//     The summary is `.*` (greedy) which is safe because we anchor on the
//     ": " separator right after `T<id>`.
//
// (3) FREE_PREFIX / FREE_FULL
//     FREE_PREFIX captures everything inside the brackets (which must be
//     the literal `FREE`). FREE_FULL composes it with a single space and
//     a non-empty summary.
//
// All regexes are anchored to the start and the end of the trimmed input
// (^...$ with the `m` flag) so an input that *starts* like a valid
// prefix but has trailing garbage is rejected.

// The proposal id is a `p` or `g` followed by one or more digits,
// optionally followed by `-` + alphanumerics. The outer capture group
// is the full id; the inner groups are non-capturing so the
// taskId / summary group indices are stable across regex edits.
const PROPOSAL_ID_INNER = /[pg]\d+[a-z0-9]*(?:-[a-z0-9]+)*/;
const PROPOSAL_ID_CAPTURE_GROUP_INDEX = 1;
const PROPOSAL_TASK_ID_CAPTURE_GROUP_INDEX = 2;
const PROPOSAL_SUMMARY_CAPTURE_GROUP_INDEX = 3;

const PROPOSAL_PREFIX =
	/^\[((?:[pg]\d+[a-z0-9]*(?:-[a-z0-9]+)*))\] (T[A-Za-z0-9.]+): (.*)$/;

const FREE_PREFIX = /^\[FREE\] (.+)$/;

// ---------------------------------------------------------------------------
// Length cap (≤ CHAT_TITLING_PREFIX_MAX_LENGTH)
// ---------------------------------------------------------------------------

function buildPrefixTooLongReason(): string {
	return `prefix too long for VS Code sidebar (>${CHAT_TITLING_PREFIX_MAX_LENGTH} chars)`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a chat-titling prefix into a structured result.
 *
 * Pipeline (order matters):
 *   1. Trim left + right.
 *   2. Try the proposal regex; on match, compute the visible prefix
 *      (everything before the first `:`) and verify it fits in
 *      `CHAT_TITLING_PREFIX_MAX_LENGTH` characters.
 *   3. If the proposal regex does not match, try the free regex; on
 *      match, verify the summary has at least
 *      `FREE_SUMMARY_MIN_NON_WHITESPACE` non-whitespace characters AND
 *      the full `[FREE] <summary>` text fits in
 *      `CHAT_TITLING_PREFIX_MAX_LENGTH` characters.
 *   4. Otherwise, return `valid: false`, `kind: 'invalid'` with a
 *      generic reason.
 *
 * The function never throws: any malformed input is reported through
 * the result shape so callers (e.g. the prompt-time validation in T3)
 * can surface a friendly diagnostic without try/catch.
 */
export function parseChatTitlingPrefix(
	input: string,
): IChatTitlingPrefixResult {
	const raw = input.trim();

	if (raw.length === 0) {
		return invalid(raw, 'empty input');
	}

	const proposalMatch = PROPOSAL_PREFIX.exec(raw);
	if (proposalMatch !== null) {
		// `noUncheckedIndexedAccess` widens `match[i]` to `string | undefined`.
		// The regex above uses non-capturing groups for the proposal id
		// structure, so the only capture groups (1, 2, 3) are always
		// defined whenever the match succeeds. We destructure into
		// constants and narrow with explicit checks so the result object
		// satisfies `exactOptionalPropertyTypes`.
		const proposalId = proposalMatch[PROPOSAL_ID_CAPTURE_GROUP_INDEX] ?? '';
		const taskId =
			proposalMatch[PROPOSAL_TASK_ID_CAPTURE_GROUP_INDEX] ?? '';
		const summary =
			proposalMatch[PROPOSAL_SUMMARY_CAPTURE_GROUP_INDEX] ?? '';
		if (
			proposalId.length === 0 ||
			taskId.length === 0 ||
			summary.length === 0
		) {
			return invalid(
				raw,
				'malformed proposal prefix: empty capture group',
			);
		}
		const visiblePrefix = `[${proposalId}] ${taskId}`;
		if (visiblePrefix.length > CHAT_TITLING_PREFIX_MAX_LENGTH) {
			return invalid(raw, buildPrefixTooLongReason());
		}
		// The internal `PROPOSAL_ID_INNER` regex is kept as a
		// regression guard: future migrations of `PROPOSAL_PREFIX` must
		// keep the body pattern compatible with `PROPOSAL_ID_INNER`.
		// We assert the match here as a cheap invariant.
		if (!PROPOSAL_ID_INNER.test(proposalId)) {
			return invalid(raw, `malformed proposalId "${proposalId}"`);
		}
		return {
			valid: true,
			kind: 'proposal',
			proposalId,
			taskId,
			summary,
			raw,
		};
	}

	const freeMatch = FREE_PREFIX.exec(raw);
	if (freeMatch !== null) {
		const summary = freeMatch[1] ?? '';
		if (summary.length === 0) {
			return invalid(raw, 'malformed free prefix: empty summary');
		}
		// Summary must have at least N non-whitespace characters.
		const nonWhitespaceCount = summary.replace(/\s+/g, '').length;
		if (nonWhitespaceCount < FREE_SUMMARY_MIN_NON_WHITESPACE) {
			return invalid(
				raw,
				`[FREE] summary must contain at least ${FREE_SUMMARY_MIN_NON_WHITESPACE} non-whitespace characters`,
			);
		}
		// The full `[FREE] <summary>` text must fit the cap.
		if (raw.length > CHAT_TITLING_PREFIX_MAX_LENGTH) {
			return invalid(raw, buildPrefixTooLongReason());
		}
		return {
			valid: true,
			kind: 'free',
			summary,
			raw,
		};
	}

	// Neither regex matched. The most common failure mode is a missing
	// bracket, the wrong literal (`Libre ·` instead of `[FREE]`), or a
	// missing `: ` after the `T<id>`. The diagnostic stays generic
	// because the caller is expected to surface it verbatim.
	return invalid(raw, 'input does not match the chat-titling convention');
}

/**
 * Boolean wrapper over `parseChatTitlingPrefix`.
 *
 * Equivalent to `parseChatTitlingPrefix(input).valid`; provided as a
 * separate export so callers that only need the yes/no answer (e.g. a
 * gate that prints "prefix OK" vs "prefix wrong: …") do not have to
 * import the full result shape.
 */
export function isValidChatTitlingPrefix(input: string): boolean {
	return parseChatTitlingPrefix(input).valid;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Builds a canonical invalid result.
 *
 * Centralised so the invalid-branch is built identically from every
 * rejection site. Keeping the helper private ensures the public API
 * only exposes the documented functions.
 */
function invalid(raw: string, reason: string): IChatTitlingPrefixResult {
	return {
		valid: false,
		kind: 'invalid',
		raw,
		reason,
	};
}
