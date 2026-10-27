/**
 * run-profile-capture.ts — pure profile orchestration over injected deps:
 * choose a probed profiler, run it with bounded options and normalize the
 * hotspot summary. Missing profilers degrade to `ok:'skipped'`, never throw.
 */
import type {
	IHotspot,
	IPerfProfileCaptureInput,
	IPerfProfileCaptureResult,
	IPerfProfileDeps,
	PerfProfileFormat,
} from '../contracts/interfaces/perf.interface';

const HOTSPOT_LINE =
	/^\s*(\d+)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+(.+?)\s*$/u;

const severityFor = (selfPercent: number): IHotspot['severity'] => {
	if (selfPercent >= 20) return 'high';
	if (selfPercent >= 10) return 'medium';
	if (selfPercent >= 3) return 'low';
	return 'info';
};

const parseHotspots = (report: string): readonly IHotspot[] => {
	const hotspots: IHotspot[] = [];
	for (const line of report.split(/\r?\n/u)) {
		const match = HOTSPOT_LINE.exec(line);
		if (match === null) continue;
		const [, samplesText, totalText, selfText, rawName] = match;
		if (rawName === undefined) continue;
		const samples = Number(samplesText);
		const totalPercent = Number(totalText);
		const selfPercent = Number(selfText);
		const name = rawName.trim();
		if (!Number.isFinite(samples) || !Number.isFinite(selfPercent))
			continue;
		hotspots.push({
			name,
			message: `${name} — self ${selfPercent.toFixed(1)}%, total ${totalPercent.toFixed(1)}%`,
			severity: severityFor(selfPercent),
			selfPercent,
			totalPercent,
			samples,
		});
	}
	return hotspots
		.sort((left, right) => right.selfPercent - left.selfPercent)
		.slice(0, 10);
};

const pickProfiler = (
	format: PerfProfileFormat,
	probes: readonly {
		tool: string;
		available: boolean;
		installHint?: { command: string };
	}[],
): { tool: string } | undefined => {
	const preferred =
		format === 'flamegraph'
			? ['0x', 'clinic-flame', 'node-prof']
			: ['node-prof', '0x', 'clinic-flame'];
	for (const tool of preferred) {
		const match = probes.find(
			(probe) => probe.tool === tool && probe.available,
		);
		if (match !== undefined) return { tool: match.tool };
	}
	return undefined;
};

const skipHint = (
	format: PerfProfileFormat,
	probes: readonly { installHint?: { command: string } }[],
): string => {
	const hinted = probes.find((probe) => probe.installHint !== undefined)
		?.installHint?.command;
	if (hinted !== undefined) return hinted;
	return format === 'flamegraph'
		? 'Install 0x or clinic on PATH, or rerun with format: hotspots.'
		: 'Install Node.js with profiler support, or add 0x/clinic to PATH.';
};

export const runProfileCapture = async (
	input: IPerfProfileCaptureInput,
	deps: IPerfProfileDeps,
): Promise<IPerfProfileCaptureResult> => {
	const probes = await deps.probeProfilers(input.format);
	const profiler = pickProfiler(input.format, probes);
	if (profiler === undefined) {
		return {
			ok: 'skipped',
			hint: skipHint(input.format, probes),
		};
	}

	const execution = await deps.runProfiler(profiler.tool, input);
	if (!execution.ok) {
		return {
			ok: false,
			code: 'profiler-failed',
			message: `Profiler ${execution.profiler} failed with code ${execution.code}.`,
			hint:
				execution.detail ??
				(execution.timedOut
					? 'Increase timeoutMs or profile a smaller workspace slice.'
					: 'Check that the selected profiler is installed and runnable.'),
		};
	}

	const report = execution.report?.trim() ?? '';
	if (report.length === 0) {
		return {
			ok: false,
			code: 'profile-empty',
			message: `Profiler ${execution.profiler} completed without a report.`,
			hint: 'Retry with a higher timeoutMs or a heavier workload.',
		};
	}

	const hotspots = parseHotspots(report);
	if (hotspots.length === 0) {
		return {
			ok: false,
			code: 'profile-unparseable',
			message: `Profiler ${execution.profiler} completed, but no hotspots were parsed.`,
			hint: 'Retry with format: hotspots or a profiler that emits percentage summaries.',
		};
	}

	return {
		ok: true,
		profiler: execution.profiler,
		hotspots,
	};
};
