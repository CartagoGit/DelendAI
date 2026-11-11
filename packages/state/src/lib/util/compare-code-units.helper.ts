/**
 * compare-code-units.helper.ts — the order canonical data is sorted in.
 *
 * `localeCompare` is no canonical order: it depends on the machine's locale
 * and ICU data, and it ties distinct strings (U+19D2 and U+0C7D compare 0
 * both ways), so their order is left to the input and two paths that reach
 * the same state hash it differently. This compares UTF-16 code units, and
 * returns 0 only for equal strings.
 */
export const compareCodeUnits = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;
