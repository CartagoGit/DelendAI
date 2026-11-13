/**
 * redaction-policy.spec.ts — f00251 S1.
 *
 * Tests for `createDefaultRedactionPolicy`.
 */
import { describe, expect, it } from 'vitest';

import { createDefaultRedactionPolicy } from '../../../../src/lib/error-collection/redaction-policy.js';
import type { ICapturedError } from '../../../../src/lib/error-collection/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ICapturedError> = {}): ICapturedError {
	return {
		kind: 'captured-error',
		ts: '2026-01-01T00:00:00.000Z',
		errorCode: 'ERR_TEST',
		errorName: 'TestError',
		severity: 'error',
		classification: 'TYPE_ERROR',
		toolName: 'test_tool',
		packageId: 'test-package',
		pluginName: 'test-plugin',
		summary: 'Something went wrong',
		stackHead: '  at Object.<anonymous> (test.ts:1:1)',
		byteCount: 100,
		truncated: false,
		fingerprint: 'abc123',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

describe('createDefaultRedactionPolicy — secret redaction', () => {
	it('redacts API key assignment in summary', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({
			summary: 'Failed: API_KEY=supersecret12345678',
		});
		const safe = policy.redact(event);
		expect(safe.summary).not.toContain('supersecret12345678');
		expect(safe.summary).toContain('[REDACTED]');
	});

	it('redacts GitHub token in summary', () => {
		const policy = createDefaultRedactionPolicy();
		// Pattern requires ghp_ + 36+ alphanumeric chars.
		const token = 'ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';
		const event = makeEvent({ summary: `auth: ${token}` });
		const safe = policy.redact(event);
		expect(safe.summary).not.toContain(token);
	});

	it('redacts secrets in stackHead', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({
			stackHead: 'Error: token=AKIA1234567890ABCDEF\n  at fn',
		});
		const safe = policy.redact(event);
		expect(safe.stackHead).not.toContain('AKIA1234567890ABCDEF');
	});
});

// ---------------------------------------------------------------------------
// Path truncation
// ---------------------------------------------------------------------------

describe('createDefaultRedactionPolicy — path truncation', () => {
	it('collapses /Users/<name>/... prefix to ~/...', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({
			summary: 'Could not read /Users/alice/secret/file.txt',
		});
		const safe = policy.redact(event);
		expect(safe.summary).not.toContain('/Users/alice');
		expect(safe.summary).toContain('~');
	});

	it('collapses /home/<name>/... prefix to ~/...', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({
			summary: 'Missing /home/bob/.env',
		});
		const safe = policy.redact(event);
		expect(safe.summary).not.toContain('/home/bob');
		expect(safe.summary).toContain('~');
	});

	it('masks residual absolute paths via pathPattern', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({
			summary: 'Error at /var/run/app/server.sock',
		});
		const safe = policy.redact(event);
		// The path pattern matches multi-segment absolute paths.
		expect(safe.summary).not.toContain('/var/run/app/server.sock');
	});
});

// ---------------------------------------------------------------------------
// Byte-cap
// ---------------------------------------------------------------------------

describe('createDefaultRedactionPolicy — byte-cap', () => {
	it('truncates summary > argByteLimit bytes and sets truncated: true', () => {
		const policy = createDefaultRedactionPolicy({ argByteLimit: 100 });
		const longSummary = 'x'.repeat(500);
		const event = makeEvent({ summary: longSummary });
		const safe = policy.redact(event);
		expect(safe.truncated).toBe(true);
		const enc = new TextEncoder();
		expect(enc.encode(safe.summary).length).toBeLessThanOrEqual(100);
	});

	it('does not truncate when summary is within the limit', () => {
		const policy = createDefaultRedactionPolicy({ argByteLimit: 8192 });
		const event = makeEvent({ summary: 'short' });
		const safe = policy.redact(event);
		expect(safe.truncated).toBe(false);
		expect(safe.summary).toBe('short');
	});

	it('truncates a 10000-char summary and sets truncated: true with default limit', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({ summary: 'x'.repeat(10_000) });
		const safe = policy.redact(event);
		expect(safe.truncated).toBe(true);
		const enc = new TextEncoder();
		expect(enc.encode(safe.summary).length).toBeLessThanOrEqual(8192);
	});
});

// ---------------------------------------------------------------------------
// Preservation
// ---------------------------------------------------------------------------

describe('createDefaultRedactionPolicy — field preservation', () => {
	it('preserves errorCode unchanged', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({ errorCode: 'ERR_TYPE' });
		expect(policy.redact(event).errorCode).toBe('ERR_TYPE');
	});

	it('preserves errorName unchanged', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({ errorName: 'TypeError' });
		expect(policy.redact(event).errorName).toBe('TypeError');
	});

	it('preserves severity unchanged', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({ severity: 'emergency' });
		expect(policy.redact(event).severity).toBe('emergency');
	});

	it('preserves fingerprint unchanged', () => {
		const policy = createDefaultRedactionPolicy();
		const event = makeEvent({ fingerprint: 'deadbeef' });
		expect(policy.redact(event).fingerprint).toBe('deadbeef');
	});
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('createDefaultRedactionPolicy — immutability', () => {
	it('does not mutate the input event', () => {
		const policy = createDefaultRedactionPolicy();
		const original = makeEvent({ summary: 'API_KEY=secret99999999' });
		const originalSummary = original.summary;
		policy.redact(original);
		// The original object must be unchanged.
		expect(original.summary).toBe(originalSummary);
	});
});
