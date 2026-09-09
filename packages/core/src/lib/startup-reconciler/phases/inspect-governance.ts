/**
 * inspect-governance.ts — phase 10: does the forge still enforce what the
 * policy says it must?
 *
 * WHY this phase READS and never writes: applying desired state is the
 * governance broker's job, behind its own credential seam and its own
 * verification pass. A boot that quietly rewrote branch protection would
 * be the most dangerous "automatic repair" in the system — a
 * misconfigured policy could unprotect `main` before anyone read the
 * report. So this phase consumes the same desired-state builder and the
 * same per-property differ as the broker, and its only output is a
 * verdict.
 *
 * Three outcomes, and the policy chooses between them:
 *   - PASS                      → verified.
 *   - drift under `observed`    → reported, not a blocker: the operator
 *                                 asked to watch, not to enforce.
 *   - drift under `enforced`    → DEGRADED; the broker must act.
 *   - unreadable + fail-closed  → DEGRADED. A property that could not be
 *                                 evaluated is never a pass.
 *
 * A drift in a DESTRUCTIVE direction (force-push or branch deletion now
 * allowed where the policy forbids it) is ambiguous rather than merely
 * wrong: someone may have opened that door deliberately, and slamming it
 * shut at boot is not this subsystem's call.
 */

import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import {
	buildDesiredState,
	type IGovernancePropertyDiff,
	inspectDesiredVsLive,
} from '../../forge-governance/index';
import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IStartupGovernanceSeam, IStartupRepositoryKey } from '../seams';

/** What phase 10 produced. */
export interface IGovernancePhaseResult {
	readonly findings: readonly IStartupFinding[];
}

/** Properties whose relaxation destroys history rather than annoying us. */
const DESTRUCTIVE = new Set(['allowForcePush', 'allowDeletion']);

const isDestructiveDrift = (property: IGovernancePropertyDiff): boolean =>
	property.status === 'FAIL' &&
	DESTRUCTIVE.has(property.property) &&
	property.desired === false &&
	property.live === true;

export const runGovernancePhase = async (input: {
	readonly seam: IStartupGovernanceSeam | undefined;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly repository: IStartupRepositoryKey;
}): Promise<IGovernancePhaseResult> => {
	if (input.policy.governance.strategy === 'none') return { findings: [] };
	if (input.seam === undefined) {
		return {
			findings: input.policy.governance.failClosedOnUnverifiable
				? [
						finding({
							code: 'governance.unverifiable',
							phase: 'governance',
							kind: 'blocker',
							subject: `${input.repository.owner}/${input.repository.name}`,
							message:
								'The policy governs the forge but no governance reader is available; an unverifiable property is never a pass.',
						}),
					]
				: [],
		};
	}

	const desired = buildDesiredState(input.policy);
	const target = {
		owner: input.repository.owner,
		repository: input.repository.name,
	};
	const live = await input.seam.readLiveState({ target, desired });
	if (live === undefined) {
		return {
			findings: [
				finding({
					code: 'governance.unverifiable',
					phase: 'governance',
					kind: input.policy.governance.failClosedOnUnverifiable
						? 'blocker'
						: 'note',
					subject: `${target.owner}/${target.repository}`,
					message:
						'Live forge governance could not be read; nothing was inferred from its absence.',
				}),
			],
		};
	}

	const diff = inspectDesiredVsLive({ desired, live, target });
	if (diff.verdict === 'PASS') {
		return {
			findings: [
				finding({
					code: 'governance.verified',
					phase: 'governance',
					kind: 'note',
					subject: `${target.owner}/${target.repository}`,
					message: 'Live forge governance matches the policy.',
				}),
			],
		};
	}

	const findings: IStartupFinding[] = [];
	const destructive = diff.properties.filter(isDestructiveDrift);
	for (const property of destructive) {
		findings.push(
			finding({
				code: 'governance.destructive-mismatch',
				phase: 'governance',
				kind: 'blocker',
				subject: property.id,
				message: `${property.id} is relaxed on the forge in a destructive direction; the boot did not change it.`,
			}),
		);
	}
	if (diff.notExecutable.length > 0) {
		findings.push(
			finding({
				code: 'governance.unverifiable',
				phase: 'governance',
				kind: input.policy.governance.failClosedOnUnverifiable
					? 'blocker'
					: 'note',
				subject: diff.notExecutable.join(', '),
				message: `${String(diff.notExecutable.length)} governed propert(ies) could not be evaluated.`,
			}),
		);
	}
	const plainDrift = diff.failing.filter(
		(id) => !destructive.some((property) => property.id === id),
	);
	if (plainDrift.length > 0) {
		findings.push(
			finding({
				code: 'governance.drift',
				phase: 'governance',
				kind: input.policy.governance.enforced ? 'blocker' : 'note',
				subject: plainDrift.join(', '),
				message: `Live governance differs from the policy on ${String(plainDrift.length)} propert(ies); applying is the broker's job, not the boot's.`,
			}),
		);
	}
	return { findings };
};
