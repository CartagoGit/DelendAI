import { describe, expect, it } from 'vitest';

import {
	DEFAULT_DOCS_URL,
	EmbedService,
	resolveDocsUrl,
	validateDocsUrl,
} from '../../src/lib/services/embed.service';

describe('resolveDocsUrl', () => {
	it('returns the override when extension.docsUrl is set', () => {
		expect(
			resolveDocsUrl({
				extension: { docsUrl: 'https://docs.example.com' },
			}),
		).toBe('https://docs.example.com');
	});

	it('returns the default when extension.docsUrl is absent', () => {
		expect(resolveDocsUrl({})).toBe(DEFAULT_DOCS_URL);
		expect(resolveDocsUrl({ extension: {} })).toBe(DEFAULT_DOCS_URL);
		expect(resolveDocsUrl({ extension: { docsUrl: '' } })).toBe(
			DEFAULT_DOCS_URL,
		);
	});

	it('honours a custom default', () => {
		expect(resolveDocsUrl({}, 'https://staging.mcp-vertex.dev')).toBe(
			'https://staging.mcp-vertex.dev',
		);
	});
});

describe('validateDocsUrl', () => {
	it('accepts a public https URL', () => {
		const r = validateDocsUrl('https://mcp-vertex.dev');
		expect(r.ok).toBe(true);
	});

	it('rejects http URLs', () => {
		const r = validateDocsUrl('http://mcp-vertex.dev');
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('https-required');
	});

	it('rejects localhost by default', () => {
		expect(validateDocsUrl('https://localhost/foo').ok).toBe(false);
		expect(validateDocsUrl('https://127.0.0.1/foo').ok).toBe(false);
		expect(validateDocsUrl('https://[::1]/foo').ok).toBe(false);
	});

	it('allows localhost when allowLocalhost is true', () => {
		expect(
			validateDocsUrl('https://localhost/foo', { allowLocalhost: true })
				.ok,
		).toBe(true);
	});

	it('rejects private IPs by default', () => {
		expect(validateDocsUrl('https://10.0.0.5/foo').ok).toBe(false);
		expect(validateDocsUrl('https://192.168.1.1/foo').ok).toBe(false);
		expect(validateDocsUrl('https://172.16.0.1/foo').ok).toBe(false);
		expect(validateDocsUrl('https://169.254.169.254/foo').ok).toBe(false);
	});

	it('allows private IPs when allowPrivateIps is true', () => {
		expect(
			validateDocsUrl('https://10.0.0.5/foo', { allowPrivateIps: true })
				.ok,
		).toBe(true);
	});

	it('rejects non-http schemes', () => {
		expect(validateDocsUrl('file:///etc/passwd').ok).toBe(false);
		expect(validateDocsUrl('data:text/html,<x>').ok).toBe(false);
		expect(validateDocsUrl('javascript:alert(1)').ok).toBe(false);
	});

	it('rejects malformed URLs', () => {
		expect(validateDocsUrl('not a url').ok).toBe(false);
		expect(validateDocsUrl('').ok).toBe(false);
	});
});

describe('EmbedService', () => {
	it('resolves the default URL and exposes origin/host', () => {
		const svc = new EmbedService();
		const r = svc.resolve({});
		expect(r.url).toBe(DEFAULT_DOCS_URL);
		expect(r.host).toBe('mcp-vertex.dev');
	});

	it('throws on rejected URLs', () => {
		const svc = new EmbedService();
		expect(() =>
			svc.resolve({ extension: { docsUrl: 'http://insecure' } }),
		).toThrow(/docs-url-rejected/);
	});

	it('validate is a thin pass-through to validateDocsUrl', () => {
		const svc = new EmbedService();
		expect(svc.validate('https://example.com').ok).toBe(true);
		expect(svc.validate('http://example.com').ok).toBe(false);
	});
});
