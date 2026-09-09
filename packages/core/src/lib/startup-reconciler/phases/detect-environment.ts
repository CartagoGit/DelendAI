/**
 * detect-environment.ts — phase 1: who are we, where, and under which
 * model?
 *
 * WHY the policy is validated here rather than trusted: every later phase
 * derives its behaviour from the resolved policy (which branch is the
 * integration branch, whether refs are managed, whether claims exist,
 * whether abandoned work is recovered). A policy that does not resolve to
 * a coherent model would make those phases improvise, which is precisely
 * what this subsystem must never do. An invalid policy therefore stops
 * the boot at DEGRADED with the violations attached — it is not repaired,
 * because there is no way to know which axis the operator meant.
 *
 * WHY an unknown repository is a blocker and not a warning: the whole
 * work model is keyed on `(forge, owner, name)`. Guessing it would create
 * a second, parallel identity for the same project and quietly split the
 * state in two.
 */

import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import { validateDevelopmentPolicy } from '../../development-policy/validate';
import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IStartupEnvironment, IStartupEnvironmentSeam } from '../seams';

/** What phase 1 produced. */
export interface IEnvironmentPhaseResult {
	readonly environment: IStartupEnvironment;
	readonly findings: readonly IStartupFinding[];
	/** False when later phases must not run. */
	readonly ok: boolean;
}

export const runEnvironmentPhase = async (input: {
	readonly seam: IStartupEnvironmentSeam;
	readonly policy: IResolvedDevelopmentPolicy;
}): Promise<IEnvironmentPhaseResult> => {
	const environment = await input.seam.detect();
	const findings: IStartupFinding[] = [];

	for (const violation of validateDevelopmentPolicy(input.policy)) {
		findings.push(
			finding({
				code: 'environment.policy-invalid',
				phase: 'environment',
				kind: 'blocker',
				subject: violation.path,
				message: `${violation.message} Remedy: ${violation.remedy}`,
				detail: { rule: violation.rule },
			}),
		);
	}

	if (environment.repository === undefined) {
		findings.push(
			finding({
				code: 'environment.repository-unknown',
				phase: 'environment',
				kind: 'blocker',
				subject: environment.workspaceRoot,
				message:
					'The repository identity (forge/owner/name) could not be determined; the work model cannot be keyed.',
			}),
		);
	}

	return {
		environment,
		findings,
		ok: findings.length === 0,
	};
};
