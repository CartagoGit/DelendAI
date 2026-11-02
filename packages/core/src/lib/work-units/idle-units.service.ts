/**
 * idle-units.service.ts — a unit holds work, or stands where the
 * integration branch is.
 *
 * One with no commit of its own, a clean tree, and the integration branch
 * gone on ahead is a unit kept after its work landed: it does nothing, and
 * looks like work to come. Nine of them sat in one clone after a run.
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';

/**
 * The invariant, from each unit's `git rev-list --left-right --count
 * <integration>...<unit>` answer: commits only the integration branch has,
 * then commits only the unit has.
 */
export const idleUnitsInvariant = (input: {
	readonly integration: string;
	readonly units: readonly {
		readonly ref: string;
		readonly counts: string;
	}[];
}): IInvariantResult => {
	const idle = input.units
		.filter(({ counts }) => {
			const [behind = '0', ahead = ''] = counts.split(/\s+/u);
			return ahead === '0' && Number(behind) > 0;
		})
		.map(({ ref }) => ref);
	return {
		scope: 'checkout',
		id: 'units-hold-work',
		claim: `every unit holds work, or stands where \`${input.integration}\` is`,
		holds: idle.length === 0,
		observed:
			idle.length === 0
				? 'none idle'
				: `${String(idle.length)} idle: ${idle.slice(0, 3).join(', ')}`,
		remedy: 'enter it again to continue (`delendai work enter` brings an idle unit forward), or retire it (`delendai work retire --ref=<ref> --reason=<why>`)',
	};
};
