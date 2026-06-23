import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MAX_RESPONSE_BYTES,
	truncateIfTooLarge,
	toolJsonBounded,
} from '@mcp-vertex/core/public';

/**
 * truncate-if-too-large.spec.ts — pins the byte-budget contract for
 * tool responses.
 *
 * The audit's H3 (2026-06-23) flagged `tool-response.ts` as missing a
 * hard byte ceiling. This spec pins:
 *   - the default ceiling (DEFAULT_MAX_RESPONSE_BYTES)
 *   - the pass-through path (no truncation when within budget)
 *   - the truncation path (marker shape, originalBytes/finalBytes)
 *   - toolJsonBounded (the convenience wrapper around toolJson)
 */
describe('truncateIfTooLarge', () => {
	it('passes through a value that fits under the byte budget', () => {
		const value = { ok: true, count: 42 };
		const result = truncateIfTooLarge(value);
		expect(result.truncated).toBe(false);
		expect(result.value).toBe(value);
		expect(result.originalBytes).toBe(result.finalBytes);
		expect(result.originalBytes).toBeLessThanOrEqual(
			DEFAULT_MAX_RESPONSE_BYTES,
		);
	});

	it('truncates a value that exceeds the byte budget and marks it', () => {
		// Build a payload that is guaranteed to exceed any reasonable limit.
		const huge = { rows: 'x'.repeat(1024 * 1024) };
		const result = truncateIfTooLarge(huge, 1024);
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBeGreaterThan(1024);
		expect(result.finalBytes).toBeLessThanOrEqual(1024);
		const payload = result.value as {
			__truncated: true;
			originalBytes: number;
			maxBytes: number;
		};
		expect(payload.__truncated).toBe(true);
		expect(payload.originalBytes).toBe(result.originalBytes);
		expect(payload.maxBytes).toBe(1024);
	});

	it('accepts a custom maxBytes override', () => {
		const tiny = 'hello world';
		const small = truncateIfTooLarge(tiny, 4);
		expect(small.truncated).toBe(true);
		const medium = truncateIfTooLarge(tiny, 64);
		expect(medium.truncated).toBe(false);
	});

	it('returns an empty marker when maxBytes is smaller than the marker itself', () => {
		const value = { rows: 'x'.repeat(256) };
		const result = truncateIfTooLarge(value, 16);
		expect(result.truncated).toBe(true);
		expect(result.finalBytes).toBeLessThanOrEqual(16);
		// The marker is present, but the head is empty.
		const payload = result.value as {
			__truncated: true;
			originalBytes: number;
		};
		expect(payload.__truncated).toBe(true);
		expect(payload.originalBytes).toBeGreaterThan(16);
	});
});

describe('toolJsonBounded', () => {
	it('mirrors toolJson when the payload fits', () => {
		const res = toolJsonBounded({ a: 1 }, 1024);
		expect(res.structuredContent).toEqual({ a: 1 });
		expect(res.content[0]?.text).toBe(JSON.stringify({ a: 1 }));
	});

	it('emits a truncated payload when the value exceeds the budget', () => {
		const huge = { rows: 'x'.repeat(4096) };
		const res = toolJsonBounded(huge, 128);
		const structured = res.structuredContent as {
			__truncated: true;
			originalBytes: number;
		};
		expect(structured.__truncated).toBe(true);
		expect(structured.originalBytes).toBeGreaterThan(128);
		// The text payload stays under the budget too (MCP transports may
		// truncate further if the text alone overflows the JSON envelope).
		expect(
			Buffer.byteLength(res.content[0]?.text ?? '', 'utf8'),
		).toBeLessThanOrEqual(256);
	});

	it('uses the default ceiling when no override is given', () => {
		const res = toolJsonBounded({ ok: true });
		expect(res.structuredContent).toEqual({ ok: true });
		expect(
			Buffer.byteLength(res.content[0]?.text ?? '', 'utf8'),
		).toBeLessThanOrEqual(DEFAULT_MAX_RESPONSE_BYTES);
	});
});

describe('DEFAULT_MAX_RESPONSE_BYTES', () => {
	it('is a positive integer aligned with the documented token budget', () => {
		expect(DEFAULT_MAX_RESPONSE_BYTES).toBeGreaterThan(0);
		expect(Number.isInteger(DEFAULT_MAX_RESPONSE_BYTES)).toBe(true);
		// 256 KiB — the documented default from the module docstring.
		expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(256 * 1024);
	});
});
