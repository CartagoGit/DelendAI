/**
 * parity-report.ts — how the parity sampler reads its arguments and says
 * what it found. Apart from the script so that a runner without SQLite
 * can test it.
 */
import type { IParityReport } from '@delendai/state';

export const REPORT_FILE = 'state-parity-report.json';

/** `--name=<n>` as a positive integer, or the default. */
export const numberArg = (
	argv: readonly string[],
	name: string,
	fallback: number,
): number => {
	const raw = argv
		.find((arg) => arg.startsWith(`--${name}=`))
		?.slice(`--${name}=`.length);
	const parsed = Number(raw);
	return raw !== undefined && Number.isInteger(parsed) && parsed > 0
		? parsed
		: fallback;
};

/** The one line a person or a workflow log reads. */
export const summarise = (report: IParityReport): string =>
	`parity-sampler: ${String(report.operations)} operations in ${String(report.runs)} run(s), seed ${String(report.seed)}, ${String(report.generationsCompared)} generation(s) compared — driver parity ${String(report.driverParityDivergences)}, replay determinism ${String(report.replayDeterminismDivergences)}, execution determinism ${String(report.executionDeterminismDivergences)}.`;

/** Whether the run should fail its caller. */
export const diverged = (report: IParityReport): boolean =>
	report.divergences.length > 0;
