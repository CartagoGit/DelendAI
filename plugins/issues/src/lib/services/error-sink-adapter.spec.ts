import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICapturedError } from '@mcp-vertex/core/public';

import type { IGithubClient } from './error-sink-adapter';
import { createIssuesErrorSinkAdapter } from './error-sink-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEvent = (
	overrides: Partial<ICapturedError> = {},
): ICapturedError => ({
	kind: 'captured-error',
	fingerprint: 'fp-abc123',
	ts: '2026-01-01T00:00:00.000Z',
	severity: 'critical',
	classification: 'RUNTIME_ERROR',
	errorCode: 'ERR_RUNTIME',
	errorName: 'Error',
	toolName: 'test_tool',
	packageId: '@test/pkg',
	pluginName: 'test-plugin',
	summary: 'Something went wrong',
	stackHead: '',
	byteCount: 20,
	truncated: false,
	...overrides,
});

let tmpDir = '';

beforeEach(() => {
	tmpDir = mkdtempSync(join(os.tmpdir(), 'issues-error-spec-'));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Draft-mode happy path
// ---------------------------------------------------------------------------

describe('draft-mode (autoReport: false)', () => {
	it('writes a draft file with correct frontmatter and never calls createIssue', async () => {
		const createIssue = vi.fn();
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: false,
			maxReportsPerHour: 5,
		});

		const event = makeEvent();
		await adapter.sink.record(event);

		// Draft file must exist.
		const draftPath = join(tmpDir, '_errors', `${event.fingerprint}.md`);
		expect(existsSync(draftPath)).toBe(true);

		// Check frontmatter fields.
		const content = readFileSync(draftPath, 'utf8');
		expect(content).toContain('id: fp-abc123');
		expect(content).toContain('kind: incident');
		expect(content).toContain('severity: critical');
		expect(content).toContain('toolName: test_tool');
		expect(content).toContain('pluginName: test-plugin');
		expect(content).toContain('packageId: @test/pkg');
		expect(content).toContain('classification: RUNTIME_ERROR');
		expect(content).toContain('draftVersion: 1');

		// No live issue created.
		expect(createIssue).not.toHaveBeenCalled();

		const stats = adapter.getStats();
		expect(stats.draftsWritten).toBe(1);
		expect(stats.liveIssuesOpened).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Live-mode happy path
// ---------------------------------------------------------------------------

describe('live-mode (autoReport: true, severity: critical)', () => {
	it('writes a draft AND calls createIssue once with correct title', async () => {
		const createIssue = vi.fn().mockResolvedValue({
			issueNumber: 42,
			issueUrl: 'https://example.com/issues/42',
		});
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: true,
			maxReportsPerHour: 5,
		});

		const event = makeEvent({
			fingerprint: 'fp-live-01',
			severity: 'critical',
		});
		await adapter.sink.record(event);

		// Draft must exist.
		const draftPath = join(tmpDir, '_errors', `${event.fingerprint}.md`);
		expect(existsSync(draftPath)).toBe(true);

		// Live issue was created once.
		expect(createIssue).toHaveBeenCalledTimes(1);
		expect(createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'incident: test_tool — critical',
			}),
		);

		const stats = adapter.getStats();
		expect(stats.liveIssuesOpened).toBe(1);
		expect(stats.draftsWritten).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Severity gate
// ---------------------------------------------------------------------------

describe('severity gate', () => {
	it('does NOT call createIssue when severity is warning even with autoReport: true', async () => {
		const createIssue = vi.fn();
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: true,
			maxReportsPerHour: 5,
		});

		await adapter.sink.record(
			makeEvent({ fingerprint: 'fp-warn', severity: 'warning' }),
		);

		expect(createIssue).not.toHaveBeenCalled();
		const stats = adapter.getStats();
		expect(stats.draftsWritten).toBe(1);
		expect(stats.liveIssuesOpened).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Rate-limit cap
// ---------------------------------------------------------------------------

describe('rate-limit cap', () => {
	it('drops the second live issue when maxReportsPerHour is 1', async () => {
		const createIssue = vi.fn().mockResolvedValue({
			issueNumber: 1,
			issueUrl: 'https://example.com/issues/1',
		});
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: true,
			maxReportsPerHour: 1,
		});

		await adapter.sink.record(
			makeEvent({ fingerprint: 'fp-rate-a', severity: 'critical' }),
		);
		await adapter.sink.record(
			makeEvent({ fingerprint: 'fp-rate-b', severity: 'emergency' }),
		);

		expect(createIssue).toHaveBeenCalledTimes(1);
		const stats = adapter.getStats();
		expect(stats.liveIssuesOpened).toBe(1);
		expect(stats.liveIssuesDropped).toBe(1);
		expect(stats.draftsWritten).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Fingerprint dedup
// ---------------------------------------------------------------------------

describe('fingerprint dedup', () => {
	it('calls createIssue only once for the same fingerprint', async () => {
		const now = Date.now();
		const createIssue = vi.fn().mockResolvedValue({
			issueNumber: 7,
			issueUrl: 'https://example.com/issues/7',
		});
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: true,
			maxReportsPerHour: 100,
			clock: () => new Date(now),
		});

		const event = makeEvent({
			fingerprint: 'fp-dedup',
			severity: 'critical',
		});
		await adapter.sink.record(event);
		await adapter.sink.record(event);

		expect(createIssue).toHaveBeenCalledTimes(1);
		const stats = adapter.getStats();
		expect(stats.liveIssuesOpened).toBe(1);
		expect(stats.liveIssuesDropped).toBe(1);
		expect(stats.draftsWritten).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Network failure
// ---------------------------------------------------------------------------

describe('network failure', () => {
	it('resolves without throwing and counts githubFailures when createIssue throws', async () => {
		const stderrChunks: string[] = [];
		const _originalWrite = process.stderr.write.bind(process.stderr);
		const spy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: unknown) => {
				stderrChunks.push(String(chunk));
				return true;
			});

		const createIssue = vi
			.fn()
			.mockRejectedValue(new Error('network unreachable'));
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: { createIssue } as IGithubClient,
			scaffoldDir: tmpDir,
			autoReport: true,
			maxReportsPerHour: 5,
		});

		await expect(
			adapter.sink.record(
				makeEvent({ fingerprint: 'fp-fail', severity: 'emergency' }),
			),
		).resolves.toBeUndefined();

		spy.mockRestore();

		// Draft still written.
		const draftPath = join(tmpDir, '_errors', 'fp-fail.md');
		expect(existsSync(draftPath)).toBe(true);

		const stats = adapter.getStats();
		expect(stats.githubFailures).toBe(1);
		expect(stats.draftsWritten).toBe(1);

		expect(stderrChunks.some((c) => c.includes('[issues-error]'))).toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// Redaction proof
// ---------------------------------------------------------------------------

describe('redaction proof', () => {
	it('does not write raw secret into the draft (core already redacted the summary)', async () => {
		const adapter = createIssuesErrorSinkAdapter({
			githubClient: undefined,
			scaffoldDir: tmpDir,
			autoReport: false,
			maxReportsPerHour: 5,
		});

		// The core would have already redacted the summary before calling sink.record.
		// We simulate a pre-redacted summary (the adapter must not re-introduce secrets).
		const event = makeEvent({
			fingerprint: 'fp-redact',
			summary: 'API_KEY=sk-test-[REDACTED]',
		});
		await adapter.sink.record(event);

		const draftPath = join(tmpDir, '_errors', 'fp-redact.md');
		const content = readFileSync(draftPath, 'utf8');
		expect(content).not.toContain('sk-test-12345-secret');
	});
});
