/**
 * as-array.ts — replaces `value as unknown[]` / `value as Array<T>` in
 * tests that need to narrow a loosely-typed (often JSON-decoded) test
 * result down to something `.length`, `[0]`, `.map(...)` etc. can work
 * with.
 *
 * `value as unknown[]` performs NO runtime check at all — if the real
 * value is not an array (a bug in the code under test, or a schema
 * change), the cast succeeds silently and the failure surfaces several
 * lines later as a confusing `undefined is not a function` on
 * `.map`/`.length`, far from its actual cause.
 *
 * `asArray<T>(value)` performs one real runtime check (`Array.isArray`)
 * before narrowing, so a non-array value fails immediately with a clear
 * message pointing at the assertion itself.
 *
 * Honest limitation, stated plainly: this does NOT validate that each
 * element has shape `T` — that would need a full runtime validator
 * (e.g. a Zod schema) per call site, which is disproportionate for a
 * test assertion helper. `asArray` only proves "this is actually an
 * array"; the element type `T` is asserted, not verified, exactly like
 * a normal `as` cast would be for the element type. It is strictly
 * better than `as unknown[]`, not a complete replacement for a real
 * decoder.
 */
export const asArray = <T>(value: unknown): readonly T[] => {
	if (!Array.isArray(value)) {
		throw new Error(
			`asArray: expected an array, got ${typeof value} (${JSON.stringify(value)})`,
		);
	}
	return value as readonly T[];
};
