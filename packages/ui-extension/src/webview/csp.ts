/**
 * webview/csp.ts — f00079 S1 (closes a00040 H2).
 *
 * A single Content-Security-Policy source of truth for every webview a
 * host renders. The audit found the 7 webviews were created with
 * `enableScripts: true` and NO `Content-Security-Policy`, so a
 * compromised `<script src=>` (or an injected page) had the full
 * extension-host WebView API surface.
 *
 * The policy is `default-deny`: scripts/connections/frames are blocked
 * unless a per-webview override explicitly opts in. Keeping the deny in
 * ONE frozen object (and the opt-ins in ONE map) makes the security
 * review a single `grep` instead of N divergent copies scattered across
 * the command surfaces.
 *
 * `styleSrc` permits `'unsafe-inline'` because the shared UI renderers
 * inline their component CSS (`<style>...`); that is a deliberate,
 * reviewed exception — inline STYLE cannot execute, unlike inline
 * script.
 */
export interface IWebviewCspPolicy {
	readonly scriptSrc: readonly string[];
	readonly styleSrc: readonly string[];
	readonly connectSrc: readonly string[];
	readonly frameSrc: readonly string[];
}

/** The default-deny baseline. Frozen so callers cannot mutate it. */
export const DEFAULT_DENY: IWebviewCspPolicy = Object.freeze({
	scriptSrc: Object.freeze(["'none'"]) as readonly string[],
	// Inline component CSS is permitted; inline style cannot execute.
	styleSrc: Object.freeze(["'self'", "'unsafe-inline'"]) as readonly string[],
	connectSrc: Object.freeze(["'none'"]) as readonly string[],
	frameSrc: Object.freeze(["'none'"]) as readonly string[],
});

/**
 * Per-webview opt-ins, keyed by the webview's logical name. A webview
 * that renders inline `<script>` blocks (toolbar / settings / dashboard
 * / knowledge) must opt into `script-src 'unsafe-inline'` here — making
 * the exception explicit and reviewable. JSON-only webviews
 * (proposals / overview / metrics / validation) take the default-deny.
 */
export const WEBVIEW_CSP_OVERRIDES: ReadonlyMap<
	string,
	Partial<IWebviewCspPolicy>
> = new Map<string, Partial<IWebviewCspPolicy>>([
	// JSON-only render surfaces — default-deny is correct, no override.
	['proposals', {}],
	['overview', {}],
	['metrics', {}],
	['validation', {}],
	// Script-bearing surfaces render inline `<script>` from the shared
	// UI renderers; they require `'unsafe-inline'` until a nonce-based
	// pipeline lands (deferred follow-up).
	['toolbar', { scriptSrc: ["'unsafe-inline'"], connectSrc: ["'self'"] }],
	['settings', { scriptSrc: ["'unsafe-inline'"] }],
	['dashboard', { scriptSrc: ["'unsafe-inline'"], connectSrc: ["'self'"] }],
	['knowledge', { scriptSrc: ["'unsafe-inline'"] }],
]);

/**
 * Merge the default-deny baseline with a per-webview override. The
 * override REPLACES a directive when present (it does not append), so a
 * webview that needs `script-src 'unsafe-inline'` carries exactly that
 * — no accidental widening from concatenation.
 */
export const resolveCspPolicy = (
	webview: string,
	overrides: ReadonlyMap<
		string,
		Partial<IWebviewCspPolicy>
	> = WEBVIEW_CSP_OVERRIDES,
): IWebviewCspPolicy => {
	const override = overrides.get(webview);
	if (override === undefined) return DEFAULT_DENY;
	return {
		scriptSrc: override.scriptSrc ?? DEFAULT_DENY.scriptSrc,
		styleSrc: override.styleSrc ?? DEFAULT_DENY.styleSrc,
		connectSrc: override.connectSrc ?? DEFAULT_DENY.connectSrc,
		frameSrc: override.frameSrc ?? DEFAULT_DENY.frameSrc,
	};
};

/** Serialise a policy into a `Content-Security-Policy` header value. */
export const cspHeaderValue = (policy: IWebviewCspPolicy): string =>
	[
		"default-src 'none'",
		`script-src ${policy.scriptSrc.join(' ')}`,
		`style-src ${policy.styleSrc.join(' ')}`,
		`connect-src ${policy.connectSrc.join(' ')}`,
		`frame-src ${policy.frameSrc.join(' ')}`,
	].join('; ');

/**
 * Inject a `<meta http-equiv="Content-Security-Policy">` tag into an
 * HTML document's `<head>`. Idempotent-ish: if the document already
 * carries a CSP meta tag we leave it untouched (so a renderer that
 * already set its own stricter policy wins). When there is no `<head>`
 * the tag is prepended so the policy still applies.
 */
export const injectCspMeta = (
	html: string,
	policy: IWebviewCspPolicy,
): string => {
	if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
		return html;
	}
	const meta = `<meta http-equiv="Content-Security-Policy" content="${cspHeaderValue(
		policy,
	)}" />`;
	if (/<head[^>]*>/i.test(html)) {
		return html.replace(/<head[^>]*>/i, (open) => `${open}\n\t${meta}`);
	}
	return `${meta}\n${html}`;
};

/** Convenience: resolve + inject in one call for a named webview. */
export const withCsp = (
	webview: string,
	html: string,
	overrides: ReadonlyMap<
		string,
		Partial<IWebviewCspPolicy>
	> = WEBVIEW_CSP_OVERRIDES,
): string => injectCspMeta(html, resolveCspPolicy(webview, overrides));
