#!/usr/bin/env bun
/**
 * diff-snapshots.script.ts — compare a candidate metrics snapshot against a
 * baseline and fail (non-zero exit) when any tool regresses beyond the
 * configured threshold.
 *
 * Single Responsibility: this module only diffs two already-resolved
 * snapshots and renders a report. It does not know how the baseline was
 * fetched (`get-baseline.script.ts`) or how the candidate was produced
 * (the CI job runs `metrics { persist: true }` against a live server).
 * That separation is what makes both halves testable with plain fixtures.
 */
import type {
	IMetricsSnapshotFile,
	IMetricSnapshotEntry,
} from './get-baseline.script.ts';

export interface IThresholds {
	readonly tokenDeltaPct: number;
	readonly latencyDeltaPct: number;
	readonly bytesDeltaPct: number;
}

export const DEFAULT_THRESHOLDS: IThresholds = {
	tokenDeltaPct: 20,
	latencyDeltaPct: 20,
	bytesDeltaPct: 20,
};

export type IToolDiffStatus =
	| 'regression'
	| 'improved'
	| 'unchanged'
	| 'new'
	| 'removed';

export interface IToolDiff {
	readonly tool: string;
	readonly status: IToolDiffStatus;
	readonly baselineBytesPerCall: number | null;
	readonly candidateBytesPerCall: number | null;
	readonly bytesDeltaPct: number | null;
	readonly baselineMsPerCall: number | null;
	readonly candidateMsPerCall: number | null;
	readonly latencyDeltaPct: number | null;
}

export interface IDiffReport {
	readonly ok: boolean;
	readonly thresholds: IThresholds;
	readonly tools: readonly IToolDiff[];
	readonly regressions: readonly IToolDiff[];
}

/** Average response bytes per call — the proxy for "token cost" per AGENTS.md M12. */
const bytesPerCall = (entry: IMetricSnapshotEntry): number | null =>
	entry.calls > 0 ? entry.totalBytes / entry.calls : null;

const msPerCall = (entry: IMetricSnapshotEntry): number | null =>
	entry.calls > 0 ? entry.totalMs / entry.calls : null;

const pctDelta = (
	baseline: number | null,
	candidate: number | null,
): number | null => {
	if (baseline === null || candidate === null || baseline === 0) return null;
	return ((candidate - baseline) / baseline) * 100;
};

/**
 * Diff a baseline + candidate snapshot pair against the given thresholds.
 * Pure function — no I/O, no process.exit — so it is trivially unit-testable.
 */
export const diffSnapshots = (
	baseline: IMetricsSnapshotFile,
	candidate: IMetricsSnapshotFile,
	thresholds: IThresholds = DEFAULT_THRESHOLDS,
): IDiffReport => {
	const toolNames = new Set([
		...Object.keys(baseline.tools),
		...Object.keys(candidate.tools),
	]);
	const tools: IToolDiff[] = [];

	for (const tool of [...toolNames].sort((a, b) => a.localeCompare(b))) {
		const before = baseline.tools[tool];
		const after = candidate.tools[tool];

		if (before === undefined && after !== undefined) {
			tools.push({
				tool,
				status: 'new',
				baselineBytesPerCall: null,
				candidateBytesPerCall: bytesPerCall(after),
				bytesDeltaPct: null,
				baselineMsPerCall: null,
				candidateMsPerCall: msPerCall(after),
				latencyDeltaPct: null,
			});
			continue;
		}
		if (before !== undefined && after === undefined) {
			tools.push({
				tool,
				status: 'removed',
				baselineBytesPerCall: bytesPerCall(before),
				candidateBytesPerCall: null,
				bytesDeltaPct: null,
				baselineMsPerCall: msPerCall(before),
				candidateMsPerCall: null,
				latencyDeltaPct: null,
			});
			continue;
		}
		if (before === undefined || after === undefined) continue; // unreachable, narrows types

		const baselineBytes = bytesPerCall(before);
		const candidateBytes = bytesPerCall(after);
		const bytesDeltaPct = pctDelta(baselineBytes, candidateBytes);
		const baselineMs = msPerCall(before);
		const candidateMs = msPerCall(after);
		const latencyDeltaPct = pctDelta(baselineMs, candidateMs);

		const isRegression =
			(bytesDeltaPct !== null &&
				bytesDeltaPct > thresholds.bytesDeltaPct) ||
			(latencyDeltaPct !== null &&
				latencyDeltaPct > thresholds.latencyDeltaPct);
		const isImproved =
			!isRegression &&
			((bytesDeltaPct !== null && bytesDeltaPct < -1) ||
				(latencyDeltaPct !== null && latencyDeltaPct < -1));

		tools.push({
			tool,
			status: isRegression
				? 'regression'
				: isImproved
					? 'improved'
					: 'unchanged',
			baselineBytesPerCall: baselineBytes,
			candidateBytesPerCall: candidateBytes,
			bytesDeltaPct,
			baselineMsPerCall: baselineMs,
			candidateMsPerCall: candidateMs,
			latencyDeltaPct,
		});
	}

	const regressions = tools.filter((t) => t.status === 'regression');
	return { ok: regressions.length === 0, thresholds, tools, regressions };
};

const fmtPct = (n: number | null): string =>
	n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtNum = (n: number | null): string => (n === null ? '—' : n.toFixed(1));

/** Render the diff report as a GitHub-flavoured Markdown table. */
export const renderMarkdownReport = (report: IDiffReport): string => {
	const lines: string[] = [
		'## Metrics longitudinal regression gate',
		'',
		report.ok
			? '✅ No tool regressed beyond threshold.'
			: `❌ ${report.regressions.length} tool(s) regressed beyond threshold.`,
		'',
		`Thresholds: tokens(bytes/call) +${report.thresholds.bytesDeltaPct}%, latency(ms/call) +${report.thresholds.latencyDeltaPct}%.`,
		'',
		'| Tool | Status | Bytes/call (Δ%) | Latency ms/call (Δ%) |',
		'| --- | --- | --- | --- |',
	];
	for (const t of report.tools) {
		const bytesCell = `${fmtNum(t.candidateBytesPerCall)} (${fmtPct(t.bytesDeltaPct)})`;
		const latencyCell = `${fmtNum(t.candidateMsPerCall)} (${fmtPct(t.latencyDeltaPct)})`;
		lines.push(
			`| ${t.tool} | ${t.status} | ${bytesCell} | ${latencyCell} |`,
		);
	}
	return `${lines.join('\n')}\n`;
};

const readThresholdsFromEnv = (): IThresholds => ({
	tokenDeltaPct: Number(
		process.env.METRICS_TOKEN_DELTA_PCT ?? DEFAULT_THRESHOLDS.tokenDeltaPct,
	),
	latencyDeltaPct: Number(
		process.env.METRICS_LATENCY_DELTA_PCT ??
			DEFAULT_THRESHOLDS.latencyDeltaPct,
	),
	bytesDeltaPct: Number(
		process.env.METRICS_BYTES_DELTA_PCT ?? DEFAULT_THRESHOLDS.bytesDeltaPct,
	),
});

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const baselinePath =
		process.env.METRICS_BASELINE_PATH ?? 'metrics-baseline.json';
	const candidatePath =
		process.env.METRICS_CANDIDATE_PATH ?? 'metrics-candidate.json';
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;

	const main = async (): Promise<void> => {
		const { readFile, appendFile } = await import('node:fs/promises');
		let baselineRaw: string;
		try {
			baselineRaw = await readFile(baselinePath, 'utf8');
		} catch {
			console.log(
				`ℹ diff-snapshots: no baseline at ${baselinePath} — skipping gate (first release).`,
			);
			return;
		}

		let baseline: IMetricsSnapshotFile;
		let candidate: IMetricsSnapshotFile;
		try {
			baseline = JSON.parse(baselineRaw) as IMetricsSnapshotFile;
		} catch (err) {
			console.error(
				`✖ diff-snapshots: corrupted baseline at ${baselinePath}: ${String(err)}`,
			);
			process.exit(1);
			return;
		}
		try {
			candidate = JSON.parse(
				await readFile(candidatePath, 'utf8'),
			) as IMetricsSnapshotFile;
		} catch (err) {
			console.error(
				`✖ diff-snapshots: cannot read candidate at ${candidatePath}: ${String(err)}`,
			);
			process.exit(1);
			return;
		}

		const report = diffSnapshots(
			baseline,
			candidate,
			readThresholdsFromEnv(),
		);
		const markdown = renderMarkdownReport(report);
		console.log(markdown);
		if (summaryPath !== undefined) {
			await appendFile(summaryPath, markdown);
		}
		if (!report.ok) {
			process.exit(1);
		}
	};

	main().catch((err: unknown) => {
		console.error(
			`✖ diff-snapshots failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
