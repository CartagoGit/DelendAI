/**
 * land-rounds.helper.ts — a pass covers what arrives while it runs. After a
 * round, the forge is asked whether a land run was created since the round
 * began reading and is not finished (queued, pending or never enqueued): such
 * a run may never start, so the pass reads the forge again itself. Bounded;
 * a listing that fails ends the pass normally with a note, never fails it.
 */
import type { ILandForge } from '@delendai/core/cli';

import type { ILandRounds } from '../contracts/interfaces/integration-pass.interface';
import { LAND_MAX_ROUNDS } from '../contracts/constants/integration-pass.constant';

export const runLandRounds = async <T>(
	forge: Pick<ILandForge, 'landRuns'>,
	round: () => Promise<T>,
	/** A report after which no further round makes sense (the branch is gone). */
	over: (report: T) => boolean = () => false,
): Promise<ILandRounds<T>> => {
	const reports: T[] = [];
	const notes: string[] = [];
	for (let n = 1; n <= LAND_MAX_ROUNDS; n += 1) {
		let known: number;
		try {
			known = Math.max(0, ...(await forge.landRuns()).map((r) => r.id));
		} catch (cause) {
			notes.push(
				`the land runs could not be listed (${String(cause)}); one round`,
			);
			reports.push(await round());
			return { reports, notes };
		}
		const report = await round();
		reports.push(report);
		if (over(report)) return { reports, notes };
		let newer: readonly { id: number; status: string }[];
		try {
			newer = (await forge.landRuns()).filter(
				(r) => r.id > known && r.status !== 'completed',
			);
		} catch (cause) {
			notes.push(
				`the land runs could not be listed after round ${String(n)} (${String(cause)})`,
			);
			return { reports, notes };
		}
		const first = newer[0];
		if (first === undefined) return { reports, notes };
		if (n === LAND_MAX_ROUNDS)
			notes.push(
				`run ${String(first.id)} (${first.status}) was created during round ${String(n)}; ${String(LAND_MAX_ROUNDS)} rounds are the most, it does the rest`,
			);
	}
	return { reports, notes };
};
