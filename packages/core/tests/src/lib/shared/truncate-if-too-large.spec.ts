import { describe, expect, it } from 'vitest';

import {
	DEFAULT_COMPACT_RESPONSE_BYTES,
	DEFAULT_MAX_RESPONSE_BYTES,
	MAX_RESPONSE_BYTES_CEILING,
	truncateIfTooLarge,
	toolJsonBounded,
} from '@delendai/core/public';

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
describe('truncateIfTooLarge', async () => {
	it('passes through a value that fits under the byte budget', async () => {
		const value = { ok: true, count: 42 };
		const result = truncateIfTooLarge(value);
		expect(result.truncated).toBe(false);
		expect(result.value).toBe(value);
		expect(result.originalBytes).toBe(result.finalBytes);
		expect(result.originalBytes).toBeLessThanOrEqual(
			DEFAULT_MAX_RESPONSE_BYTES,
		);
	});

	it('truncates a value that exceeds the byte budget and marks it', async () => {
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

	it('accepts a custom maxBytes override', async () => {
		const tiny = 'hello world';
		const small = truncateIfTooLarge(tiny, 4);
		expect(small.truncated).toBe(true);
		const medium = truncateIfTooLarge(tiny, 64);
		expect(medium.truncated).toBe(false);
	});

	it('returns an explicit clamp when maxBytes is smaller than the honest minimum envelope', async () => {
		const value = { rows: 'x'.repeat(256) };
		const result = truncateIfTooLarge(value, 16);
		expect(result.truncated).toBe(true);
		const payload = result.value as {
			__truncated: true;
			originalBytes: number;
			finalBytes: number;
			clamped?: true;
			head: { kind: string };
		};
		expect(payload.__truncated).toBe(true);
		expect(payload.originalBytes).toBeGreaterThan(16);
		expect(payload.clamped).toBe(true);
		expect(payload.finalBytes).toBe(result.finalBytes);
		expect(payload.finalBytes).toBeGreaterThan(16);
		expect(payload.head.kind).toBe('object');
	});
});

describe('toolJsonBounded', async () => {
	it('mirrors toolJson when the payload fits', async () => {
		const res = toolJsonBounded({ a: 1 }, 1024);
		expect(res.structuredContent).toEqual({ a: 1 });
		expect(res.content[0]?.text).toBe(JSON.stringify({ a: 1 }));
	});

	it('emits a truncated payload when the value exceeds the budget', async () => {
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

	it('uses the default ceiling when no override is given', async () => {
		const res = toolJsonBounded({ ok: true });
		expect(res.structuredContent).toEqual({ ok: true });
		expect(
			Buffer.byteLength(res.content[0]?.text ?? '', 'utf8'),
		).toBeLessThanOrEqual(DEFAULT_MAX_RESPONSE_BYTES);
	});
});

describe('DEFAULT_MAX_RESPONSE_BYTES', async () => {
	it('is a positive integer aligned with the provisional emergency ceiling', async () => {
		expect(DEFAULT_MAX_RESPONSE_BYTES).toBeGreaterThan(0);
		expect(DEFAULT_COMPACT_RESPONSE_BYTES).toBeGreaterThan(0);
		expect(MAX_RESPONSE_BYTES_CEILING).toBeGreaterThanOrEqual(
			DEFAULT_COMPACT_RESPONSE_BYTES,
		);
		expect(Number.isInteger(DEFAULT_MAX_RESPONSE_BYTES)).toBe(true);
		expect(DEFAULT_COMPACT_RESPONSE_BYTES).toBe(8 * 1024);
		expect(MAX_RESPONSE_BYTES_CEILING).toBe(64 * 1024);
		expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(MAX_RESPONSE_BYTES_CEILING);
	});
});
