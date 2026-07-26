/**
 * text-utils.ts — small text helpers (c00126 S1).
 *
 * Pure: no I/O, no globals. The 1-based `lineOf` mapper is used by every
 * scanner that reports line numbers; the `fnv1a` hash is used by the
 * shingle deduplicator. Both are deliberately tiny so they inline well
 * in tight loops.
 */

/** 1-based line number for a character index in `body`. */
export const lineOf = (body: string, charIndex: number): number => {
	let line = 1;
	for (let i = 0; i < charIndex && i < body.length; i += 1) {
		if (body.charCodeAt(i) === 10) line += 1;
	}
	return line;
};

/** FNV-1a 32-bit hash, hex string, lowercase, zero-padded to 8 chars. */
export const fnv1a = (s: string): string => {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
};
