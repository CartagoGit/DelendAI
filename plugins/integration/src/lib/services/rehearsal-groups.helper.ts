/**
 * rehearsal-groups.helper.ts — the catalogue cut into the groups that play
 * as separate jobs. One pure function of the scenarios and the group size,
 * in the catalogue's own order, every scenario in exactly one group.
 */
import type { IGroupSpec } from '../contracts/interfaces/rehearsal-groups.interface';

/** `scenarios` in consecutive groups of at most `size`. */
export const partitionScenarios = <T>(
	scenarios: readonly T[],
	size: number,
): readonly (readonly T[])[] =>
	Array.from({ length: Math.ceil(scenarios.length / size) }, (_, index) =>
		scenarios.slice(index * size, (index + 1) * size),
	);

const GROUP_PATTERN = /^([1-9]\d*)\/([1-9]\d*)$/u;

export const parseGroupSpec = (text: string): IGroupSpec | undefined => {
	const match = GROUP_PATTERN.exec(text);
	return match === null
		? undefined
		: { n: Number(match[1]), total: Number(match[2]) };
};

/** The group `spec` names, or the refusal that says the valid range. */
export const selectGroup = <T>(
	scenarios: readonly T[],
	size: number,
	spec: IGroupSpec,
): { readonly scenarios: readonly T[] } | { readonly error: string } => {
	const groups = partitionScenarios(scenarios, size);
	const group = groups[spec.n - 1];
	if (spec.total !== groups.length || group === undefined)
		return {
			error: `group ${String(spec.n)}/${String(spec.total)} is out of range: ${String(scenarios.length)} scenario(s) in groups of ${String(size)} make ${String(groups.length)} group(s), valid 1/${String(groups.length)} to ${String(groups.length)}/${String(groups.length)}`,
		};
	return { scenarios: group };
};
