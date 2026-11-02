/**
 * fake-partial.ts — replaces `as unknown as T` in test files with a
 * single, audited, generic type assertion.
 *
 * The dominant smell this repo's tests had (196 occurrences across 120
 * files, measured 2026-08-28): a test builds a hand-rolled partial
 * object and forces it through a huge SDK-shaped parameter with
 * `x as unknown as Parameters<typeof f>[0]` — a cast that disables ALL
 * type checking on the object, including typos, wrong field types, and
 * (when the real signature later changes) silently accepting a shape
 * that no longer matches reality.
 *
 * `fakePartial<TReal, TRequiredKeys>(fake)` narrows that blast radius:
 *
 *   - Every key you list in `TRequiredKeys` is enforced present with
 *     the exact real type — omit one, and the test fails to COMPILE.
 *   - Every key you provide (required or not) is checked against
 *     `TReal`'s real type for that key — a wrong type fails to compile.
 *   - Typo'd or invented keys fail to compile (excess-property check).
 *   - When the real interface's signature changes (a field renamed, a
 *     parameter type widened/narrowed), any fake that declared that
 *     field as required, or that supplied it, fails to compile instead
 *     of silently continuing to pass.
 *
 * The one thing this helper CANNOT do — stated plainly, see
 * `IFakePartialInput` — is discover which fields a test's code path
 * actually reads. That is a runtime fact; `TRequiredKeys` must be
 * supplied by the author. A helper that pretended otherwise (e.g. a
 * bare `(partial: Partial<T>): T => partial as T` with no way to force
 * required fields) would just be `as unknown as T` wearing a nicer
 * name — this one is not that.
 */
import type { IFakePartialInput } from '../contracts/interfaces/fake-partial.interface';

export const fakePartial = <TReal, TRequiredKeys extends keyof TReal = never>(
	fake: IFakePartialInput<TReal, TRequiredKeys>,
): TReal => fake as TReal;
