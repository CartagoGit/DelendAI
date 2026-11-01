/**
 * development-delivery-schema.constant.ts — the axes of the development
 * policy that describe how work TRAVELS.
 *
 * The integration axis, the coordination axis, the recovery axis and the
 * governance axis are one question — "what happens to a slice between the
 * author's hands and the integration branch?" — and they were declared
 * inside the same file as the axes that describe the repository itself.
 *
 * Split out, the file that names the repository stays about the
 * repository, and this one is about delivery. The shape is unchanged:
 * every axis here is the same schema, moved.
 */
import { z } from 'zod';

import { PUBLICATION_GRANULARITIES } from '../contracts/constants/publication-granularity.constant';
import { documentedEnum } from './config-schema-docs';
import { PUBLICATION_GRANULARITY_DOCS } from '../contracts/constants/config-schema-docs.constant';
import { strategy, wholeNumber } from './development-axis-helpers';

export const IntegrationAxis = z
	.object({
		strategy: strategy(
			'How work reaches the integration branch: the strategy that decides whether a candidate is pushed directly, opened as a pull request, or merged from a work ref after local certification.',
		),
		requiredChecks: z
			.array(
				z
					.string()
					.min(1)
					.describe(
						'The name of a check context the forge runs, such as `build`.',
					),
			)
			.describe(
				'The check contexts that must pass before a candidate may land on the integration branch. Leave it empty to let the forge decide.',
			)
			.optional(),
		requireLatestIntegration: z
			.boolean()
			.describe(
				'Whether a candidate must be re-validated against the CURRENT integration head before it merges, not merely against the head it was branched from. Turn it on to stop two independently-green candidates from combining into a red branch.',
			)
			.optional(),
		mergeGreenProgressContinuously: z
			.boolean()
			.describe(
				'Whether a coherent, green part of a slice is integrated as soon as it is ready, instead of waiting for the whole slice.',
			)
			.optional(),
		publication: z
			.object({
				granularity: documentedEnum(
					PUBLICATION_GRANULARITIES,
					PUBLICATION_GRANULARITY_DOCS,
				)
					.describe(
						'How much work one publication carries: a slice, a whole proposal, or whichever fits under the adaptive thresholds.',
					)
					.optional(),
				adaptive: z
					.object({
						maxSlices: wholeNumber(
							'The most slices a proposal may have and still be published as one pull request.',
						),
						maxChangedLines: wholeNumber(
							'The most changed lines, added plus removed, across a proposal’s slices and still be published as one pull request.',
						),
					})
					.strict()
					.describe(
						'The thresholds that decide when `adaptive` granularity publishes a proposal whole and when it publishes it slice by slice.',
					)
					.optional(),
			})
			.strict()
			.describe('How finished work is grouped into pull requests.')
			.optional(),
		requiredApprovals: wholeNumber(
			'The approving human reviews a candidate needs before it may merge into the integration branch. 0 means autonomous integration: certified, green work lands without waiting for a person.',
		),
		releaseRequiredApprovals: wholeNumber(
			'The same for the release branch, held separately because promoting to release is where a project most often wants a human in the loop. It may not be lower than `requiredApprovals`.',
		),
		releaseRequiredChecks: z
			.array(
				z
					.string()
					.min(1)
					.describe(
						'The name of a check context the release branch runs, such as a version gate.',
					),
			)
			.describe(
				'The checks the RELEASE branch requires, when they differ from the integration branch’s — a version gate, a changelog check. Leave it empty to use the same list as `requiredChecks`.',
			)
			.optional(),
		mergeMethod: z
			.string()
			.min(1)
			.describe(
				'The merge shape the forge performs: `squash`, `merge` or `rebase`.',
			)
			.optional(),
		deleteMergedWorkRef: z
			.boolean()
			.describe(
				'Whether the work ref is deleted once its work has landed. Turn it off when the ref is also the record of the work and should be kept.',
			)
			.optional(),
		linearHistory: z
			.boolean()
			.describe(
				'Whether the integration branch must keep a linear history, with no merge commits in it.',
			)
			.optional(),
		allowForcePush: z
			.boolean()
			.describe(
				'Whether an agent may rewrite history on the integration branch. Keep it off unless the project genuinely rewrites published work.',
			)
			.optional(),
		allowDeleteIntegrationBranch: z
			.boolean()
			.describe(
				'Whether the integration branch itself may be deleted. Almost always off: the integration branch is the one branch the project must not lose.',
			)
			.optional(),
	})
	.strict()
	.describe(
		'How finished work reaches the integration branch, and what has to be true before it lands.',
	)
	.optional();

export const CoordinationAxis = z
	.object({
		strategy: strategy(
			'How concurrent agents are kept apart: the strategy that decides whether ownership is advisory, locked on disk, or leased transactionally in the operational state.',
		),
		leaseTtlMinutes: wholeNumber(
			'The minutes before a lease nobody renewed is treated as dead. 0 means a lease never expires.',
		),
		roster: z
			.array(
				z
					.string()
					.min(1)
					.describe(
						'The identity of one agent or person allowed to work here.',
					),
			)
			.describe(
				'Who may work here, as whoever launches the agents declares them. Leave it out to let anyone work.',
			)
			.optional(),
	})
	.strict()
	.describe('How concurrent agents avoid clobbering each other.')
	.optional();

export const RecoveryAxis = z
	.object({
		strategy: strategy(
			'What happens to abandoned work: the strategy that decides whether it is forgotten or picked up by a new owner.',
		),
		neverDiscardUnmergedWork: z
			.boolean()
			.describe(
				'Whether unmerged work is never deleted on age alone — only on durable evidence that it is already represented in the integration branch, or on an explicit deprecation.',
			)
			.optional(),
	})
	.strict()
	.describe('What happens to work whose owner disappeared.')
	.optional();

export const GovernanceAxis = z
	.object({
		strategy: strategy(
			'How the runtime treats the forge’s own settings: the strategy that decides whether they are ignored, only observed and reported as drift, or reconciled against this policy.',
		),
		failClosedOnUnverifiable: z
			.boolean()
			.describe(
				'Whether a forge property that could not be evaluated is reported as a failure instead of quietly as a pass. Keep it on wherever the forge’s settings are enforced.',
			)
			.optional(),
	})
	.strict()
	.describe(
		'How much authority the runtime has over the forge’s own settings.',
	)
	.optional();
