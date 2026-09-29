/**
 * work-unit-land.service.ts — how `work publish` finishes a unit under a
 * profile that integrates by MERGE rather than by pull request.
 *
 * The served work model told such a project to finish with
 * `delendai work publish`, and publishing pushed a publication ref and
 * stopped: no pull request would ever be opened for it, and nothing
 * merged it. The work sat on a ref, or an agent improvised a merge by
 * hand. This is the route that model names, run through the engines that
 * already existed for it and had no caller:
 *
 *   hold the work ref
 *   → `runLocalMergeCycle`: read the integration head, build the merge in
 *     a throwaway index, certify THAT commit with the project's gate, and
 *     compare-and-swap it onto the remote integration branch
 *   → end the work ref the way a publication ends it.
 *
 * The shared checkout is never touched: the merge is plumbing, the gate
 * runs in a worktree of its own, and the checkout follows the branch the
 * way it always does, by the host's fast-forward.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ILandWorkUnitRequest,
	ILocalCertificationReport,
} from '../contracts/interfaces/local-certification.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import type { IWorkPublishStep } from '../contracts/interfaces/work-publish.interface';
import { createInMemoryCriticalSection } from '../integration-engine/critical-section';
import { createIntegrationGit } from '../integration-engine/git-operations';
import { runLocalMergeCycle } from '../integration-engine/local-merge-cycle';
import type { ILocalMergeCycleOutcome } from '../integration-engine/local-merge-cycle.interface';

import { certifyCandidate } from './local-certification.service';
import { endWorkRef, withWorkRefHeld } from './work-publish.service';
import { readGit } from './work-unit-shared.service';

/** The certification's failure, stated as what a person reads next. */
const certificationRefusal = (
	report: ILocalCertificationReport | undefined,
	branch: string,
): string => {
	if (report === undefined || !report.declared) {
		return `${branch} declares no validation gate, and this profile lands only work its gate certified. Declare one on ${branch} — \`validationMatrix.scopes\` in delendai.config.json, or a \`validate\` script in package.json — then publish again.`;
	}
	if (report.setupFailure !== undefined) {
		return `The gate could not run: ${report.setupFailure}. Nothing landed; publish again once the cause is fixed.`;
	}
	const failed = report.steps
		.filter((step) => !step.passed)
		.map(
			(step) =>
				`- ${step.scope}: ${step.command}${step.outputTail === undefined || step.outputTail.length === 0 ? '' : `\n${step.outputTail}`}`,
		);
	return [
		`The validation gate failed on the merge of this unit into ${branch} at ${report.againstIntegrationSha.slice(0, 8)}; nothing landed:`,
		...failed,
		'Fix it in the unit (commit in its worktree, or checkpoint), and publish again.',
	].join('\n');
};

/** Why an attempt that did not land ended, and the step that follows. */
const nextStepFor = (
	outcome: ILocalMergeCycleOutcome,
	report: ILocalCertificationReport | undefined,
	remote: string,
	branch: string,
): string => {
	const refresh = `bring ${remote}/${branch} into the unit (in its worktree: \`git fetch ${remote} && git merge ${remote}/${branch}\`) and publish again`;
	switch (outcome.status) {
		case 'blocked':
			return certificationRefusal(report, branch);
		case 'revalidating':
			return `${outcome.reason} Nothing landed: ${refresh}.`;
		case 'stale':
			return `${outcome.reason} Publish again: the next attempt certifies against the new head.`;
		case 'RECOVERY_CONFLICT':
			return `${outcome.reason} Conflicting paths: ${(outcome.conflicts ?? []).join(', ') || '(git named none)'}. Nothing landed: ${refresh}, resolving them.`;
		default:
			return `${outcome.reason} Nothing landed; the work ref is untouched.`;
	}
};

/**
 * Land one unit on the integration branch by certified merge, and end its
 * work ref unless it is kept. Refuses — with the next step — whenever the
 * gate did not certify the exact pair that would land.
 */
export const landWorkUnit = async (
	request: ILandWorkUnitRequest,
): Promise<IWorkUnitResult> => {
	const { root, policy, remote, workRef } = request;
	const branch = policy.branches.integration;
	const held = await withWorkRefHeld(root, workRef, async () => {
		const git = await createIntegrationGit(root);
		if (git === undefined) {
			return {
				outcome: {
					status: 'failed',
					reason: `${root} is not inside a git working tree.`,
				} satisfies ILocalMergeCycleOutcome,
				report: undefined,
			};
		}
		const certify = request.certify ?? certifyCandidate;
		let report: ILocalCertificationReport | undefined;
		const outcome = await runLocalMergeCycle(
			policy,
			git,
			createInMemoryCriticalSection(),
			{
				workRef,
				remote,
				// The unit's worktree and remote copy end with it, below.
				deleteWorkRef: false,
				certify: async (candidate) => {
					report = await certify({
						root,
						candidateSha: candidate.candidateSha,
						integrationSha: candidate.integrationSha,
					});
					// Nothing certified is not a failed certification: the
					// engine refuses both, and says which.
					return report.declared && report.setupFailure === undefined
						? {
								passed: report.passed,
								againstIntegrationSha: candidate.integrationSha,
							}
						: undefined;
				},
			},
		);
		return { outcome, report };
	});
	if (!held.held) {
		return { code: EXIT_CODE.VALIDATION, error: held.detail };
	}
	const { outcome, report } = held.value;
	const certification = report === undefined ? {} : { certification: report };
	if (outcome.status !== 'merged') {
		return {
			code: EXIT_CODE.VALIDATION,
			data: { landed: false, landing: outcome, ...certification },
			error: nextStepFor(outcome, report, remote, branch),
		};
	}

	const tip = readGit(root, ['rev-parse', '-q', '--verify', workRef]);
	const steps: IWorkPublishStep[] = [];
	let workRefRemoved = false;
	if (request.keepWorkRef) {
		steps.push({
			name: 'remove-work-ref',
			ok: false,
			detail: `kept: ${request.keepWorkRefBecause ?? '--keep-work-ref was passed'}.`,
		});
	} else if (tip !== undefined && tip.length > 0) {
		const ended = endWorkRef({
			root,
			cwd: request.cwd,
			workRef,
			tip,
			remote,
		});
		steps.push(...ended.steps);
		workRefRemoved = ended.removed;
	}
	return {
		// Landed but not cleaned up is not a success: the namespace is left
		// carrying a ref that looks like live work.
		code:
			workRefRemoved || request.keepWorkRef
				? EXIT_CODE.OK
				: EXIT_CODE.VALIDATION,
		data: {
			landed: true,
			landing: outcome,
			...certification,
			workRefRemoved,
			steps,
		},
	};
};
