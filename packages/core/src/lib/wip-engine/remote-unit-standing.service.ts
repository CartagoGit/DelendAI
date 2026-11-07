/**
 * remote-unit-standing.service.ts — what the remote holds of a unit: its
 * work ref, and whether the unit was retired there.
 *
 * Asked in one trip. A unit retired on the remote (given up, or silent
 * past what a unit is given) ended there; pushed again from a checkout
 * that still had its branch, it came back on every pass of the publisher
 * and was retired again on every pass of the queue.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { planRetirement } from '../work-units/work-retire.service';

/** The remote's word on `ref`, or why it could not be asked. */
export const remoteUnitStanding = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remote: string,
	ref: string,
): Promise<
	| { readonly ok: false; readonly reason: string }
	| {
			readonly ok: true;
			/** The work ref's tip there, when it exists. */
			readonly tip?: string;
			/** Where the unit's tip is kept, and which, when it was retired. */
			readonly retired?: { readonly ref: string; readonly tip: string };
	  }
> => {
	const retiredRef = planRetirement({
		branch: ref,
		namespace: policy.branches.namespacePrefix,
		workRefPrefix: policy.branches.workRefPrefix,
		publicationRefPrefix: policy.branches.publicationRefPrefix,
	})?.retiredRef;
	const listed = await run([
		'ls-remote',
		'--',
		remote,
		ref,
		...(retiredRef === undefined ? [] : [retiredRef]),
	]);
	if (!listed.ok) {
		return {
			ok: false,
			reason: listed.reason ?? `could not inspect ${remote}`,
		};
	}
	const tips = new Map(
		listed.output
			.split('\n')
			.map((line) => line.trim().split(/\s+/u))
			.filter((fields) => fields.length === 2)
			.map(([sha = '', name = '']) => [name, sha] as const),
	);
	const tip = tips.get(ref);
	const retiredTip =
		retiredRef === undefined ? undefined : tips.get(retiredRef);
	return {
		ok: true,
		...(tip === undefined ? {} : { tip }),
		...(retiredRef === undefined || retiredTip === undefined
			? {}
			: { retired: { ref: retiredRef, tip: retiredTip } }),
	};
};
