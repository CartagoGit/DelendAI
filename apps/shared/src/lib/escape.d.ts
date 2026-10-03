/**
 * `apps/shared/src/lib/escape.ts` — single source of truth for HTML
 * escape helpers used by every shared renderer.
 *
 * Every shared component that returns an HTML string calls into
 * this module rather than re-implementing the escape regexes
 * locally. Before this module existed, 9 different `.ts` files
 * each shipped their own `escapeAttr` / `escapeHtml` with subtly
 * different regex sets (some escaped `<`, some did not; some
 * escaped `'`, some did not). The inconsistency was a real
 * security surface — the audit found a renderer that did not
 * escape `'` in a `data-*` attribute, leaving an XSS hole if the
 * host passed user input. Every renderer now uses the same pair
 * of helpers; the test in `escape.spec.ts` pins the contract.
 *
 * Why two helpers and not one
 * ---------------------------
 * - `escapeHtml(s)` is the strict helper: it escapes every
 *   HTML-significant character so the result is safe to drop
 *   into either element text or an attribute value (inside
 *   double quotes). Use this for any interpolated user content
 *   that lands inside `<p>`, `<h1>`, `<span>`, etc.
 * - `escapeAttr(s)` escapes every character that could break an
 *   attribute value when the attribute is delimited by double
 *   quotes: `&`, `<`, `>`, `"`, `'`. Use this for any interpolated
 *   value that lands inside `attr="…"` — even though the
 *   strict helper would also work, `escapeAttr` makes the intent
 *   explicit and reads cleaner at the call site.
 *
 * The two helpers share the same regex set, so they are
 * interchangeable for double-quoted attributes; the split is
 * purely a documentation aid.
 */
/**
 * Escape every HTML-significant character. Safe to drop into
 * element text, double-quoted attribute values, and most
 * single-quoted attribute values. For literal single-quoted
 * attribute contexts (`attr='…'`), also wrap the result in
 * `escapeAttr` because that context allows line breaks that
 * the element-text version does not need to defend against.
 */
export declare const escapeHtml: (raw: string) => string;
/**
 * Escape every character that could break an attribute value
 * when the attribute is delimited by double quotes. Identical
 * regex set to `escapeHtml` — see the comment there for the
 * reason the two helpers exist as separate names.
 */
export declare const escapeAttr: typeof escapeHtml;
