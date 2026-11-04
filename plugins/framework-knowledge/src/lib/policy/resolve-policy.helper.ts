// resolve-policy.helper.ts — decide the effective answer for one
// topic from an ordered set of inputs.
//
// Pure: no fs, no network. Priority order (highest first):
// technical impossibility > explicit user configuration > explicit
// project configuration > detected project convention > framework
// recommendation > delendai's default. The winning source is
// authoritative — a `removed` verdict on it is reported as
// `incompatible`, never silently replaced by a lower-priority source,
// because a rule keyed to the wrong choice is worse than a named
// contradiction.

import type {
	IPolicyInputs,
	IPolicyOption,
	IPolicyResolution,
	IPolicySource,
} from '../contracts/interfaces/policy.interface';

/** `supported` when no record names this value: absence is not a prohibition. */
const forceOf = (
	options: readonly IPolicyOption[],
	value: string,
): IPolicyOption['force'] =>
	options.find((option) => option.value === value)?.force ?? 'supported';

interface ICandidate {
	readonly source: IPolicySource;
	readonly value: string;
}

const candidatesInOrder = (inputs: IPolicyInputs): readonly ICandidate[] => {
	const out: ICandidate[] = [];
	if (inputs.userPreference !== undefined) {
		out.push({ source: 'user', value: inputs.userPreference });
	}
	if (inputs.projectPreference !== undefined) {
		out.push({ source: 'project', value: inputs.projectPreference });
	}
	if (inputs.detectedConvention !== undefined) {
		out.push({
			source: 'detected-convention',
			value: inputs.detectedConvention.value,
		});
	}
	if (inputs.frameworkRecommendation !== undefined) {
		out.push({
			source: 'framework-recommendation',
			value: inputs.frameworkRecommendation,
		});
	}
	out.push({ source: 'default', value: inputs.defaultValue });
	return out;
};

/**
 * Resolve the effective answer. The first candidate in priority order
 * wins outright: its force decides whether the outcome is `resolved`
 * or `incompatible`. Only `technicalImpossibility`, checked before any
 * candidate, can refuse regardless of what any source asked for.
 */
export const resolvePolicy = (inputs: IPolicyInputs): IPolicyResolution => {
	if (inputs.technicalImpossibility !== undefined) {
		const [first] = candidatesInOrder(inputs);
		return {
			outcome: 'incompatible',
			value: first?.value ?? inputs.defaultValue,
			source: 'technical-impossibility',
			reason: inputs.technicalImpossibility.reason,
		};
	}

	const [winner] = candidatesInOrder(inputs);
	// `defaultValue` is always pushed, so `candidatesInOrder` never
	// returns an empty array; this satisfies the type checker without
	// hiding a real "no candidate" case.
	if (winner === undefined) {
		return {
			outcome: 'resolved',
			value: inputs.defaultValue,
			source: 'default',
			force: forceOf(inputs.options, inputs.defaultValue),
		};
	}

	const force = forceOf(inputs.options, winner.value);
	if (force === 'removed') {
		return {
			outcome: 'incompatible',
			value: winner.value,
			source: winner.source,
			reason: `${winner.value} is removed at the installed framework version`,
		};
	}
	return {
		outcome: 'resolved',
		value: winner.value,
		source: winner.source,
		force,
	};
};
