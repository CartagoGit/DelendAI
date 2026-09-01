/**
 * fake-partial.interface.ts — the contract behind `fakePartial` (see
 * `../../lib/fake-partial.ts`).
 *
 * Convention: types live in `contracts/interfaces/*.interface.ts`
 * (`lint:types-in-contracts`); every exported type/interface is
 * prefixed `I`.
 */

/**
 * The shape a caller must provide to `fakePartial<TReal, TRequiredKeys>`.
 *
 * - Every key in `TRequiredKeys` becomes non-optional and must match
 *   `TReal`'s type for that key exactly — omit one and TypeScript
 *   refuses to compile (`Property '...' is missing`).
 * - Every OTHER key stays optional (`Partial<TReal>`), but if provided,
 *   must still match `TReal`'s type for that key — a wrong type is a
 *   compile error, not a silent pass.
 * - Object-literal excess-property checking (standard TS behaviour for
 *   literals assigned to a known type) rejects typo'd or invented keys
 *   that don't exist on `TReal` at all.
 *
 * `TRequiredKeys` is supplied by the TEST AUTHOR, not inferred. This is
 * a deliberate, stated limitation: the type system has no way to know
 * which fields a given code path will actually read at runtime — that
 * is a runtime fact, not a type-level one. `fakePartial` trusts the
 * caller's declaration of "the fields this test exercises" instead of
 * guessing. A field the test relies on that the author forgot to list
 * in `TRequiredKeys` is NOT caught by this helper — it stays a silent
 * `undefined` at runtime, exactly like a hand-rolled partial object
 * would. Always list every field your test's execution path reads.
 */
export type IFakePartialInput<
	TReal,
	TRequiredKeys extends keyof TReal = never,
> = Partial<TReal> & Required<Pick<TReal, TRequiredKeys>>;
