/**
 * csp.spec.ts — f00079 S1 (closes a00040 H2).
 *
 * Pins the Content-Security-Policy source of truth: the default-deny
 * shape, that it is frozen (immutable), that per-webview overrides
 * REPLACE (not append) directives, and that `injectCspMeta` inserts a
 * single CSP meta tag into the document head.
 */
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_DENY,
	WEBVIEW_CSP_OVERRIDES,
	cspHeaderValue,
	injectCspMeta,
	resolveCspPolicy,
	withCsp,
	type IWebviewCspPolicy,
} from '../../src/webview/csp';

describe('DEFAULT_DENY', () => {
	it('denies script / connect / frame by default', () => {
		expect(DEFAULT_DENY.scriptSrc).toEqual(["'none'"]);
		expect(DEFAULT_DENY.connectSrc).toEqual(["'none'"]);
		expect(DEFAULT_DENY.frameSrc).toEqual(["'none'"]);
	});

	it('permits inline style (reviewed exception)', () => {
		expect(DEFAULT_DENY.styleSrc).toContain("'unsafe-inline'");
	});

	it('is frozen and cannot be mutated', () => {
		expect(Object.isFrozen(DEFAULT_DENY)).toBe(true);
		expect(() => {
			(DEFAULT_DENY as unknown as { scriptSrc: string[] }).scriptSrc = [
				"'self'",
			];
		}).toThrow();
	});
});

describe('resolveCspPolicy', () => {
	it('returns default-deny for an unknown webview', () => {
		expect(resolveCspPolicy('does-not-exist')).toBe(DEFAULT_DENY);
	});

	it('returns default-deny for JSON-only webviews', () => {
		for (const name of ['proposals', 'overview', 'metrics', 'validation']) {
			const policy = resolveCspPolicy(name);
			expect(policy.scriptSrc).toEqual(["'none'"]);
			expect(policy.connectSrc).toEqual(["'none'"]);
		}
	});

	it('replaces (not appends) overridden directives', () => {
		const policy = resolveCspPolicy('toolbar');
		// override is `script-src 'unsafe-inline'` — exactly that, no 'none'.
		expect(policy.scriptSrc).toEqual(["'unsafe-inline'"]);
		expect(policy.scriptSrc).not.toContain("'none'");
		expect(policy.connectSrc).toEqual(["'self'"]);
		// untouched directives keep the default-deny value.
		expect(policy.frameSrc).toEqual(["'none'"]);
	});

	it('honors a caller-supplied override map', () => {
		const custom = new Map<string, Partial<IWebviewCspPolicy>>([
			['x', { frameSrc: ["'self'"] }],
		]);
		expect(resolveCspPolicy('x', custom).frameSrc).toEqual(["'self'"]);
	});
});

describe('cspHeaderValue', () => {
	it('serialises every directive with default-src none', () => {
		const header = cspHeaderValue(resolveCspPolicy('proposals'));
		expect(header).toContain("default-src 'none'");
		expect(header).toContain("script-src 'none'");
		expect(header).toContain("frame-src 'none'");
	});
});

describe('injectCspMeta / withCsp', () => {
	it('injects a CSP meta tag into the head', () => {
		const html =
			'<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';
		const out = injectCspMeta(html, DEFAULT_DENY);
		expect(out).toMatch(
			/<meta http-equiv="Content-Security-Policy" content="[^"]+"/,
		);
		// single occurrence
		expect(out.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(
			1,
		);
	});

	it('does not double-inject when a CSP is already present', () => {
		const html =
			'<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'" /></head>';
		const out = injectCspMeta(html, DEFAULT_DENY);
		expect(out.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(
			1,
		);
		expect(out).toBe(html);
	});

	it('prepends the meta when there is no head', () => {
		const out = injectCspMeta('<body>hi</body>', DEFAULT_DENY);
		expect(
			out.startsWith('<meta http-equiv="Content-Security-Policy"'),
		).toBe(true);
	});

	it('withCsp resolves the named policy then injects', () => {
		const out = withCsp('proposals', '<head></head>');
		expect(out).toContain("script-src 'none'");
	});
});

describe('WEBVIEW_CSP_OVERRIDES coverage', () => {
	it('declares an entry for every shipped webview name', () => {
		for (const name of [
			'proposals',
			'overview',
			'metrics',
			'validation',
			'toolbar',
			'settings',
			'dashboard',
			'knowledge',
		]) {
			expect(WEBVIEW_CSP_OVERRIDES.has(name)).toBe(true);
		}
	});
});
