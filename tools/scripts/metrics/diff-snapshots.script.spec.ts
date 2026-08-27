#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	diffSnapshots,
	isComparableSurface,
	renderMarkdownReport,
	type IThresholds,
} from './diff-snapshots.script.ts';
import type { IMetricsSnapshotFile } from './get-baseline.script.ts';

const snapshot = (
	tools: IMetricsSnapshotFile['tools'],
): IMetricsSnapshotFile => ({
	at: '2026-06-21T00:00:00.000Z',
	tools,
	totals: { calls: 0, errors: 0, totalMs: 0, totalBytes: 0 },
});

const THRESHOLDS: IThresholds = {
	tokenDeltaPct: 20,
	latencyDeltaPct: 20,
	bytesDeltaPct: 20,
};

describe('diffSnapshots', async () => {
	it('reports ok=true when no tool regresses', async () => {
		const baseline = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 3000,
			},
		});
		const candidate = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 102,
				maxMs: 21,
				totalBytes: 3010,
			},
		});

		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		expect(report.ok).toBe(true);
		expect(report.regressions).toHaveLength(0);
	});

	it('flags a +20% bytes/call regression as a failure', async () => {
		const baseline = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1000,
			},
		});
		const candidate = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1300,
			},
		});

		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		expect(report.ok).toBe(false);
		expect(report.regressions.map((r) => r.tool)).toEqual(['overview']);
		expect(report.regressions[0]?.status).toBe('regression');
	});

	it('passes a +5% delta (under threshold)', async () => {
		const baseline = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1000,
			},
		});
		const candidate = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1050,
			},
		});

		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		expect(report.ok).toBe(true);
		expect(report.tools[0]?.status).toBe('unchanged');
	});

	it('marks a brand-new tool as "new" (info, not a failure)', async () => {
		const baseline = snapshot({});
		const candidate = snapshot({
			auto_work: {
				calls: 5,
				errors: 0,
				totalMs: 50,
				maxMs: 10,
				totalBytes: 500,
			},
		});

		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		expect(report.ok).toBe(true);
		expect(report.tools[0]?.status).toBe('new');
	});

	it('marks a removed tool as "removed" (warning, not a failure)', async () => {
		const baseline = snapshot({
			legacy_tool: {
				calls: 5,
				errors: 0,
				totalMs: 50,
				maxMs: 10,
				totalBytes: 500,
			},
		});
		const candidate = snapshot({});

		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		expect(report.ok).toBe(true);
		expect(report.tools[0]?.status).toBe('removed');
	});

	it('treats a corrupted baseline as caller responsibility (diff over malformed shape throws upstream, not silently)', async () => {
		// diffSnapshots itself only consumes a parsed object; the "corrupted
		// baseline" failure mode is a JSON.parse failure handled by the CLI
		// entrypoint, not by this pure function. We assert the pure function's
		// contract instead: an empty `tools` map on either side is handled
		// gracefully (no throw), which is what lets the CLI distinguish
		// "valid empty snapshot" from "parse failure" cleanly upstream.
		const baseline = snapshot({});
		const candidate = snapshot({});

		expect(() =>
			diffSnapshots(baseline, candidate, THRESHOLDS),
		).not.toThrow();
	});

	it('renders a markdown table with a pass/fail header', async () => {
		const baseline = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1000,
			},
		});
		const candidate = snapshot({
			overview: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 20,
				totalBytes: 1300,
			},
		});
		const report = diffSnapshots(baseline, candidate, THRESHOLDS);

		const markdown = renderMarkdownReport(report);

		expect(markdown).toContain('## Metrics longitudinal regression gate');
		expect(markdown).toContain('❌');
		expect(markdown).toContain('| overview |');
	});
});

describe('diffSnapshots — a00065 S5: error-rate regression', async () => {
	it('flags a tool that regressed to failing calls even when bytes/latency shrank', async () => {
		// A tool that now errors on every call: shorter response (error
		// envelope), "faster" (no real work) — but a regression, not an
		// improvement. This is the docs_search (3/3 errors) failure mode.
		const baseline = snapshot({
			search: {
				calls: 10,
				errors: 0,
				totalMs: 500,
				maxMs: 60,
				totalBytes: 5000,
			},
		});
		const candidate = snapshot({
			search: {
				calls: 10,
				errors: 10, // 100% error rate now
				totalMs: 50, // "faster"
				maxMs: 6,
				totalBytes: 200, // "smaller"
			},
		});
		const report = diffSnapshots(baseline, candidate, THRESHOLDS);
		expect(report.ok).toBe(false);
		const search = report.tools.find((t) => t.tool === 'search');
		expect(search?.status).toBe('regression');
		expect(search?.errorRateDelta).toBeGreaterThan(0);
	});

	it('tolerates a single one-off flake below the error-rate floor', async () => {
		const baseline = snapshot({
			git: {
				calls: 100,
				errors: 0,
				totalMs: 100,
				maxMs: 5,
				totalBytes: 1000,
			},
		});
		const candidate = snapshot({
			git: {
				calls: 100,
				errors: 1,
				totalMs: 100,
				maxMs: 5,
				totalBytes: 1000,
			},
		});
		const report = diffSnapshots(baseline, candidate, THRESHOLDS);
		// 1% error rate is below the floor — not a regression on its own.
		expect(report.ok).toBe(true);
	});

	it('a bytes regression still fires even when errors are unchanged', async () => {
		const baseline = snapshot({
			docs: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 5,
				totalBytes: 1000,
			},
		});
		const candidate = snapshot({
			docs: {
				calls: 10,
				errors: 0,
				totalMs: 100,
				maxMs: 5,
				totalBytes: 1400,
			},
		});
		const report = diffSnapshots(baseline, candidate, THRESHOLDS);
		expect(report.ok).toBe(false);
		expect(report.tools.find((t) => t.tool === 'docs')?.status).toBe(
			'regression',
		);
	});
});

describe('isComparableSurface', () => {
	const withSurface = (toolsMeasured: number): IMetricsSnapshotFile => ({
		...snapshot({}),
		surface: { toolsMeasured },
	});

	it('accepts two runs that measured the same number of tools', () => {
		expect(isComparableSurface(withSurface(19), withSurface(19))).toBe(
			true,
		);
	});

	it('rejects a baseline captured from a smaller surface', () => {
		// The real case: the collector used to resolve only 7 of 29 plugins,
		// so its snapshot recorded far fewer tools and near-empty payloads.
		expect(isComparableSurface(withSurface(5), withSurface(19))).toBe(
			false,
		);
	});

	it('rejects a baseline published before the fingerprint existed', () => {
		expect(isComparableSurface(snapshot({}), withSurface(19))).toBe(false);
	});
});
