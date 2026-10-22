/**
 * migration-report.service.ts — what a startup migration tells the person
 * whose files it changed.
 *
 * The development-policy migration edits `delendai.config.json`, a file
 * the project owns. Doing that without saying so is the failure this
 * exists to prevent, so the lines it returns name the file and the model.
 */
import { describeBranches } from '../development-policy/release-branch';
import { policyOriginNote } from '../development-policy/served-work-model';
import { readWorkspacePolicy } from '../work-units/development-policy.service';
import type { IMigrationRunResult } from '../contracts/interfaces/workspace-migration.interface';

import { DEVELOPMENT_POLICY_MIGRATOR_ID } from './migrators/development-policy.constant';

/** One line per workspace change this run made; empty when it wrote none. */
export const adoptionReportLines = async (
	result: IMigrationRunResult,
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const lines = (result.transitions?.outcomes ?? []).flatMap((outcome) =>
		outcome.status === 'applied'
			? outcome.steps.map((step) =>
					step.kind === 'kept'
						? `Configuration change left alone — ${step.detail}`
						: `Configuration change applied — ${step.detail}`,
				)
			: [],
	);
	const wrote = result.outcomes.some(
		(outcome) =>
			outcome.status === 'migrated' &&
			outcome.id === DEVELOPMENT_POLICY_MIGRATOR_ID,
	);
	if (wrote) {
		const policy = await readWorkspacePolicy(workspaceRoot);
		lines.push(
			`${policyOriginNote(policy) ?? 'adopted and written'} — \`${policy.profile}\`, ${describeBranches(policy.branches)}`,
		);
	}
	return lines;
};
