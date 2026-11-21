/**
 * develop-red.helper.ts — which merge turned the integration branch red.
 *
 * Between the last green run and a red one, the failing specs belong to the
 * one merge whose footprint (its files, its zones, the specs that read its
 * files) reaches them; the attribution is `attributeCulprit`'s. With no
 * single owner the suspects are listed and the earliest is tried first.
 * The red run's failing spec ids are kept as the known-failing set of its
 * commit. The branch comes from policy through the ports, never from here.
 */
import { attributeCulprit } from '../decisions/culprit.helper';
import type { IChangeFootprint } from '../decisions/overlap.interface';
import type {
	IDevelopMerge,
	IDevelopRedDiagnosis,
	IDevelopRedPorts,
	IDevelopRedRun,
} from './land.interface';

/** Declared readers are specs the change reaches: they join its files. */
const withReaders = (footprint: IChangeFootprint): IChangeFootprint => ({
	...footprint,
	files: new Set([...footprint.files, ...(footprint.readers ?? [])]),
});

export const diagnoseDevelopRed = async (
	ports: IDevelopRedPorts,
	input: { readonly green: string; readonly red: IDevelopRedRun },
): Promise<IDevelopRedDiagnosis> => {
	const merges = await ports.mergesBetween(input.green, input.red.commit);
	const members = await Promise.all(
		merges.map(async (merge) => ({
			number: merge.number,
			own: withReaders(await ports.footprintOf(merge)),
		})),
	);
	await ports.recordKnownFailing(input.red.commit, [
		...input.red.failingSpecs,
	]);
	const { culprit, suspects } = attributeCulprit({
		failingZones: input.red.failingZones,
		failingSpecs: input.red.failingSpecs,
		members,
	});
	const byNumber = new Map<number, IDevelopMerge>(
		merges.map((merge) => [merge.number, merge]),
	);
	const named = suspects.flatMap((number) => byNumber.get(number) ?? []);
	const culpritMerge =
		culprit === undefined ? undefined : byNumber.get(culprit);
	const revertFirst = culpritMerge ?? named[0];
	return {
		...(culpritMerge === undefined ? {} : { culprit: culpritMerge }),
		suspects: named,
		...(revertFirst === undefined ? {} : { revertFirst }),
	};
};
