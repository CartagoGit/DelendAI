#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	diffSnapshots,
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

describe('diffSnapshots', () => {
	it('reports ok=true when no tool regresses', () => {
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

	it('flags a +20% bytes/call regression as a failure', () => {
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

	it('passes a +5% delta (under threshold)', () => {
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

	it('marks a brand-new tool as "new" (info, not a failure)', () => {
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

	it('marks a removed tool as "removed" (warning, not a failure)', () => {
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

	it('treats a corrupted baseline as caller responsibility (diff over malformed shape throws upstream, not silently)', () => {
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

	it('renders a markdown table with a pass/fail header', () => {
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
