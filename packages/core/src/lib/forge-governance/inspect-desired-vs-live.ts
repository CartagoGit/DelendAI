/**
 * inspect-desired-vs-live.ts — compares the policy-derived desired state
 * against what the forge actually reports, one property at a time.
 *
 * Per-property comparison is the point. A single "protection matches"
 * boolean cannot express "we read eight settings, matched seven and could
 * not read the eighth", and that eighth is precisely the case this
 * subsystem exists to stop being reported as green. Every governed
 * property therefore gets its own row with its own tri-state, and the
 * overall verdict is a fold over those rows that has no path to `PASS`
 * while an applicable row is unreadable.
 */

import {
	BRANCH_PROPERTIES,
	type BranchProperty,
	branchPropertyId,
	type GovernanceStatus,
	type GovernanceValue,
	type IDesiredBranchRule,
	type IDesiredForgeState,
	type IDesiredRepositorySettings,
	type IForgeRepositoryRef,
	REPOSITORY_PROPERTIES,
	type RepositoryProperty,
	repositoryPropertyId,
} from './governance-contracts';
import type {
	IGovernanceDiff,
	IGovernancePropertyDiff,
} from './diff-contracts';
import type { ILiveForgeState, LiveValue } from './provider-contracts';
import { safeProviderMessage } from './redact-secrets';

/** The desired value of one branch property. */
export const desiredBranchValue = (
	rule: IDesiredBranchRule,
	property: BranchProperty,
): GovernanceValue => rule[property];

/** The desired value of one repository property. */
export const desiredRepositoryValue = (
	settings: IDesiredRepositorySettings,
	property: RepositoryProperty,
): GovernanceValue => settings[property];

const isStringList = (value: GovernanceValue): value is readonly string[] =>
	Array.isArray(value);

/** Check contexts are a SET: order is not part of the contract. */
const valuesMatch = (
	desired: GovernanceValue,
	live: GovernanceValue,
): boolean => {
	if (isStringList(desired) || isStringList(live)) {
		if (!isStringList(desired) || !isStringList(live)) return false;
		const liveSet = new Set(live);
		return (
			desired.length === live.length &&
			desired.every((item) => liveSet.has(item))
		);
	}
	return desired === live;
};

const describe = (value: GovernanceValue): string =>
	isStringList(value) ? `[${[...value].sort().join(', ')}]` : String(value);

/** Compare one property. The ONLY place a tri-state is produced. */
const compareProperty = (input: {
	readonly id: string;
	readonly scope: IGovernancePropertyDiff['scope'];
	readonly branch?: string;
	readonly property: BranchProperty | RepositoryProperty;
	readonly desired: GovernanceValue;
	readonly live: LiveValue | undefined;
	readonly applicable: boolean;
}): IGovernancePropertyDiff => {
	const base = {
		id: input.id,
		scope: input.scope,
		...(input.branch !== undefined ? { branch: input.branch } : {}),
		property: input.property,
		desired: input.desired,
		applicable: input.applicable,
	};
	if (input.live === undefined) {
		return {
			...base,
			status: 'NOT_EXECUTABLE',
			detail: `The provider adapter reported no value for ${input.id}; it cannot be treated as satisfied.`,
		};
	}
	if (input.live.kind === 'unreadable') {
		return {
			...base,
			status: 'NOT_EXECUTABLE',
			detail: safeProviderMessage(input.live.reason),
		};
	}
	const matched = valuesMatch(input.desired, input.live.value);
	return {
		...base,
		live: input.live.value,
		status: matched ? 'PASS' : 'FAIL',
		detail: matched
			? `matches (${describe(input.desired)})`
			: `expected ${describe(input.desired)}, forge reports ${describe(input.live.value)}`,
	};
};

/** Fold the rows into one verdict. `FAIL` dominates `NOT_EXECUTABLE`. */
export const foldVerdict = (
	properties: readonly IGovernancePropertyDiff[],
): GovernanceStatus => {
	const applicable = properties.filter((property) => property.applicable);
	if (applicable.some((property) => property.status === 'FAIL'))
		return 'FAIL';
	if (applicable.some((property) => property.status === 'NOT_EXECUTABLE')) {
		return 'NOT_EXECUTABLE';
	}
	return 'PASS';
};

/** Build every property row the desired state governs. */
export const enumerateProperties = (
	desired: IDesiredForgeState,
	live: ILiveForgeState,
): readonly IGovernancePropertyDiff[] => {
	const notApplicable = new Set(desired.notApplicable);
	const rows: IGovernancePropertyDiff[] = [];
	for (const property of REPOSITORY_PROPERTIES) {
		const id = repositoryPropertyId(property);
		rows.push(
			compareProperty({
				id,
				scope: 'repository',
				property,
				desired: desiredRepositoryValue(desired.repository, property),
				live: live.properties[id],
				applicable: !notApplicable.has(id),
			}),
		);
	}
	for (const rule of desired.branches) {
		for (const property of BRANCH_PROPERTIES) {
			const id = branchPropertyId(rule.branch, property);
			rows.push(
				compareProperty({
					id,
					scope: 'branch',
					branch: rule.branch,
					property,
					desired: desiredBranchValue(rule, property),
					live: live.properties[id],
					applicable: !notApplicable.has(id),
				}),
			);
		}
	}
	return rows;
};

/** Inputs to `inspectDesiredVsLive`. */
export interface IInspectInput {
	readonly desired: IDesiredForgeState;
	readonly live: ILiveForgeState;
	readonly target: IForgeRepositoryRef;
}

/** Compare desired against live and produce the structured diff. */
export const inspectDesiredVsLive = (input: IInspectInput): IGovernanceDiff => {
	const properties = enumerateProperties(input.desired, input.live);
	const applicable = properties.filter((property) => property.applicable);
	return {
		provider: input.live.provider,
		target: input.target,
		policyProfile: input.desired.policyProfile,
		properties,
		verdict: foldVerdict(properties),
		failing: applicable
			.filter((property) => property.status === 'FAIL')
			.map((property) => property.id),
		notExecutable: applicable
			.filter((property) => property.status === 'NOT_EXECUTABLE')
			.map((property) => property.id),
		notApplicable: properties
			.filter((property) => !property.applicable)
			.map((property) => property.id),
		failClosedOnUnverifiable: input.desired.failClosedOnUnverifiable,
	};
};
