import { describe, expect, it } from 'vitest';

import {
	buildRedactor,
	redactEnv,
	redactHeaders,
	redactRecord,
} from '../src/lib/redaction';

import {
	applyByteLimit,
	applyLineLimit,
	shouldFetchNextPage,
	buildArtifactTruncation,
	DEFAULT_LIMITS,
} from '../src/lib/limits';

import {
	assertSafeBaseUrl,
	validateProviderBaseUrl,
	UrlPolicyError,
	PROVIDER_DEFAULT_BASE_URLS,
} from '../src/lib/url-policy';

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

describe('buildRedactor', () => {
	it('replaces a single secret', () => {
		const redact = buildRedactor(['my-secret-token']);
		expect(redact('Authorization: Bearer my-secret-token')).toBe(
			'Authorization: Bearer [REDACTED]',
		);
	});

	it('replaces multiple secrets', () => {
		const redact = buildRedactor(['tok-abc', 'tok-xyz']);
		expect(redact('tok-abc and tok-xyz')).toBe('[REDACTED] and [REDACTED]');
	});

	it('returns identity function when no secrets provided', () => {
		const redact = buildRedactor([]);
		expect(redact('no secrets here')).toBe('no secrets here');
	});

	it('ignores empty-string secrets', () => {
		const redact = buildRedactor(['', '   ']);
		expect(redact('some value')).toBe('some value');
	});

	it('escapes special regex characters in secrets', () => {
		const redact = buildRedactor(['tok.en+value']);
		expect(redact('tok.en+value in message')).toBe('[REDACTED] in message');
	});
});

describe('redactEnv', () => {
	it('redacts values for sensitive env keys', () => {
		const result = redactEnv({
			GITHUB_TOKEN: 'secret',
			API_KEY: 'key123',
			HOME: '/home/user',
			PRIVATE_KEY: 'priv',
			GITLAB_TOKEN: 'glpat-xyz',
		});
		expect(result.GITHUB_TOKEN).toBe('[REDACTED]');
		expect(result.API_KEY).toBe('[REDACTED]');
		expect(result.HOME).toBe('/home/user');
		expect(result.PRIVATE_KEY).toBe('[REDACTED]');
		expect(result.GITLAB_TOKEN).toBe('[REDACTED]');
	});

	it('does not mutate original object', () => {
		const env = { GITHUB_TOKEN: 'secret', PATH: '/usr/bin' };
		const result = redactEnv(env);
		expect(env.GITHUB_TOKEN).toBe('secret');
		expect(result.GITHUB_TOKEN).toBe('[REDACTED]');
	});
});

describe('redactHeaders', () => {
	it('redacts authorization header', () => {
		const result = redactHeaders({
			Authorization: 'Bearer glpat-abc',
			'content-type': 'application/json',
		});
		expect(result.Authorization).toBe('[REDACTED]');
		expect(result['content-type']).toBe('application/json');
	});

	it('redacts PRIVATE-TOKEN and X-AUTH-TOKEN case-insensitively', () => {
		const result = redactHeaders({
			'PRIVATE-TOKEN': 'tok',
			'X-AUTH-TOKEN': 'val',
		});
		expect(result['PRIVATE-TOKEN']).toBe('[REDACTED]');
		expect(result['X-AUTH-TOKEN']).toBe('[REDACTED]');
	});
});

describe('redactRecord', () => {
	it('applies redactor to string values only', () => {
		const redact = buildRedactor(['secret']);
		const result = redactRecord(
			{ msg: 'contains secret', count: 42 },
			redact,
		);
		expect(result.msg).toBe('contains [REDACTED]');
		expect(result.count).toBe(42);
	});
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

describe('applyByteLimit', () => {
	it('returns unchanged text when under limit', () => {
		const result = applyByteLimit('hello', 100);
		expect(result.truncation.truncated).toBe(false);
		expect(result.text).toBe('hello');
	});

	it('truncates and marks byte-limit when over', () => {
		const big = 'a'.repeat(10);
		const result = applyByteLimit(big, 5);
		expect(result.truncation.truncated).toBe(true);
		expect(result.truncation.reason).toBe('byte-limit');
		expect(result.text.length).toBeLessThanOrEqual(5);
		expect(result.truncation.keptBytes).toBe(5);
		expect(result.truncation.originalBytes).toBe(10);
	});

	it('handles multibyte characters correctly', () => {
		// '€' is 3 bytes in UTF-8
		const result = applyByteLimit('€€€', 5);
		expect(result.truncation.truncated).toBe(true);
		expect(result.truncation.originalBytes).toBe(9);
	});
});

describe('applyLineLimit', () => {
	it('returns all lines when under limit', () => {
		const lines = ['a', 'b', 'c'];
		const result = applyLineLimit(lines, 10);
		expect(result.truncation.truncated).toBe(false);
		expect(result.lines).toHaveLength(3);
	});

	it('truncates and marks line-limit when over', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const result = applyLineLimit(lines, 5);
		expect(result.truncation.truncated).toBe(true);
		expect(result.truncation.reason).toBe('line-limit');
		expect(result.lines).toHaveLength(5);
		expect(result.truncation.originalLines).toBe(20);
		expect(result.truncation.keptLines).toBe(5);
	});
});

describe('shouldFetchNextPage', () => {
	it('returns true when both counters are within limits', () => {
		expect(shouldFetchNextPage(1, 10, DEFAULT_LIMITS)).toBe(true);
	});

	it('returns false when page limit reached', () => {
		expect(
			shouldFetchNextPage(DEFAULT_LIMITS.maxPages, 0, DEFAULT_LIMITS),
		).toBe(false);
	});

	it('returns false when artifact limit reached', () => {
		expect(
			shouldFetchNextPage(0, DEFAULT_LIMITS.maxArtifacts, DEFAULT_LIMITS),
		).toBe(false);
	});
});

describe('buildArtifactTruncation', () => {
	it('returns truncated info with server-limit reason', () => {
		const info = buildArtifactTruncation(100, DEFAULT_LIMITS);
		expect(info.truncated).toBe(true);
		expect(info.reason).toBe('server-limit');
		expect(info.keptLines).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// URL policy / SSRF
// ---------------------------------------------------------------------------

describe('assertSafeBaseUrl', () => {
	it('accepts valid https URLs', () => {
		expect(() => assertSafeBaseUrl('https://api.github.com')).not.toThrow();
		expect(() =>
			assertSafeBaseUrl('https://gitlab.example.com/api/v4'),
		).not.toThrow();
	});

	it('rejects http scheme', () => {
		expect(() => assertSafeBaseUrl('http://api.github.com')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects ftp scheme', () => {
		expect(() => assertSafeBaseUrl('ftp://example.com')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects localhost', () => {
		expect(() => assertSafeBaseUrl('https://localhost/api')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects 127.0.0.1', () => {
		expect(() => assertSafeBaseUrl('https://127.0.0.1')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects private 10.x range', () => {
		expect(() => assertSafeBaseUrl('https://10.0.0.1/api')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects private 192.168.x range', () => {
		expect(() => assertSafeBaseUrl('https://192.168.1.1')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects link-local 169.254.x', () => {
		expect(() => assertSafeBaseUrl('https://169.254.169.254')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects 0.0.0.0', () => {
		expect(() => assertSafeBaseUrl('https://0.0.0.0')).toThrow(
			UrlPolicyError,
		);
	});

	it('rejects unparseable strings', () => {
		expect(() => assertSafeBaseUrl('not a url')).toThrow(UrlPolicyError);
	});

	it('UrlPolicyError carries the original url', () => {
		let caught: unknown;
		try {
			assertSafeBaseUrl('https://localhost');
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(UrlPolicyError);
		expect((caught as UrlPolicyError).url).toBe('https://localhost');
	});
});

describe('validateProviderBaseUrl', () => {
	it('normalizes GitHub Enterprise URL', () => {
		const url = validateProviderBaseUrl(
			'https://github.example.com/api/v3/',
			'github',
		);
		expect(url).toBe('https://github.example.com/api/v3');
	});

	it('normalizes GitLab self-managed URL', () => {
		const url = validateProviderBaseUrl(
			'https://gitlab.myorg.com/api/v4/',
			'gitlab',
		);
		expect(url).toBe('https://gitlab.myorg.com/api/v4');
	});

	it('rejects private IP even for enterprise', () => {
		expect(() =>
			validateProviderBaseUrl('https://192.168.1.50/api', 'github'),
		).toThrow(UrlPolicyError);
	});
});

describe('PROVIDER_DEFAULT_BASE_URLS', () => {
	it('contains github and gitlab defaults', () => {
		expect(PROVIDER_DEFAULT_BASE_URLS.github).toBe(
			'https://api.github.com',
		);
		expect(PROVIDER_DEFAULT_BASE_URLS.gitlab).toBe('https://gitlab.com');
	});
});
