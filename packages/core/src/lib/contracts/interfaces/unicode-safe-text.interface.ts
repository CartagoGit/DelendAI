/**
 * Named Unicode tokens for outbound agent prompts (x00207).
 *
 * Agents (sender and receiver) must read meaning, not a hex escape or a
 * raw surrogate pair. Rewritten graphemes are ASCII tokens of the form
 * `[kind:name U+XXXX]`. Ordinary BMP letters / digits / punctuation /
 * accents / CJK are left untouched.
 */
export type UnicodeTokenKind = 'emoji' | 'unicode';

/** Result of inspecting a rewrite without throwing away the original. */
export interface IUnicodeSafeText {
	readonly original: string;
	readonly rewritten: string;
	readonly changed: boolean;
}
