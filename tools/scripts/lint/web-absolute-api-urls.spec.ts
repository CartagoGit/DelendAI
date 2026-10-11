import { describe, expect, it } from 'vitest';

import { findAbsoluteApiUrls } from './web-absolute-api-urls.script';

const scan = (contents: string) => findAbsoluteApiUrls('a.astro', contents);

describe('web-absolute-api-urls', () => {
	describe('what it catches', () => {
		it('flags the exact line that shipped', () => {
			expect(
				scan("const source = new EventSource('/api/events/logs');"),
			).toHaveLength(1);
		});

		it('flags every runtime fetcher, not just EventSource', () => {
			for (const call of [
				"new WebSocket('/ws')",
				"fetch('/api/status')",
				"window.open('/dashboard')",
			]) {
				expect(scan(call), call).toHaveLength(1);
			}
		});

		it('reports the line number so it can be found', () => {
			const violations = scan(
				['const a = 1;', '', "fetch('/api/x');"].join('\n'),
			);

			expect(violations[0]?.line).toBe(3);
		});
	});

	describe('what it must not catch', () => {
		it('accepts a URL built from the base', () => {
			expect(
				scan(
					'const source = new EventSource(`${base}/api/events/logs`);',
				),
			).toEqual([]);
		});

		it('accepts a relative URL', () => {
			expect(scan("fetch('api/status')")).toEqual([]);
		});

		it('accepts an absolute URL to another origin', () => {
			expect(scan("fetch('https://example.com/api/x')")).toEqual([]);
		});

		it('accepts a protocol-relative URL', () => {
			expect(scan("fetch('//cdn.example.com/x')")).toEqual([]);
		});

		it('ignores a path mentioned in a comment', () => {
			// The rule is about calls, not about the string appearing.
			for (const line of [
				"// fetch('/api/events/logs') used to be written like this",
				" * new EventSource('/api/x')",
				"<!-- fetch('/api/x') -->",
			]) {
				expect(scan(line), line).toEqual([]);
			}
		});

		it('ignores an absolute path that is not being fetched', () => {
			expect(scan("const documented = '/api/events/logs';")).toEqual([]);
		});
	});
});
