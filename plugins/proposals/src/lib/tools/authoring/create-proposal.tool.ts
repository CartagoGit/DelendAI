import type z from 'zod';
import { relative } from 'node:path';
import type { IToolRegistration } from '@delendai/core/contracts';
import { CREATE_PROPOSAL_REFUSED_NEXT_STEP } from '../../contracts/constants/create-proposal.constant';
import { adoptCreatedProposalUnit } from '../../services/created-proposal-unit.service';
import { callerCheckout, toolError, toolOk } from '@delendai/core/public';
import { createGitRunner } from '../../shared/git-runner';
import type { IValidateEvidenceDeps } from '../proposal-transition.tool';
import type { IAuthoringToolOptions } from '../authoring-options';
import { proposalPublishNextAction } from '../proposal-publish-next-action';
import {
	createPrivateIndexCommitPort,
	publicationRefFor,
	publishProposalOnRef,
} from '../publish-proposal';
import {
	CREATE_PROPOSAL_INPUT_SCHEMA,
	CREATE_PROPOSAL_OUTPUT_SCHEMA,
	type SLICE_IN,
} from '../../contracts/constants/create-proposal-schema.constant';
import { workUnitBranch } from './close-slice-support.tool';
import { createProposalDocument } from './create-proposal-document.tool';
export { createProposalDocument } from './create-proposal-document.tool';

/**
 * `create_proposal` — author a proposal markdown (frontmatter + Goal +
 * a parseable `## Slices` section) so multi-agent slice work is correct
 * by construction. Validates file disjointness, writes atomically and
 * re-syncs the index. No more hand-editing fragile markdown.
 */
export const buildCreateProposalRegistration = (
	options: IAuthoringToolOptions & {
		readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	},
): IToolRegistration => ({
	id: 'create_proposal',
	effects: ['write'],
	writeRoot: 'caller-checkout',
	refusedWriteNextStep: CREATE_PROPOSAL_REFUSED_NEXT_STEP,
	summary:
		'Author a proposal (.md with frontmatter + disjoint ## Slices), validate overlap, write + sync index.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_create_proposal`,
			{
				outputSchema: CREATE_PROPOSAL_OUTPUT_SCHEMA,
				description:
					'Create a proposal document with frontmatter, a Goal and a parseable `## Slices` section (one slice per parallelisable, file-disjoint unit). Validates disjointness, writes atomically and re-syncs the index. Returns the file path and any overlap issues.',
				inputSchema: CREATE_PROPOSAL_INPUT_SCHEMA,
			},
			async (args: {
				id?: string | undefined;
				kind?: string | undefined;
				title: string;
				goal?: string | undefined;
				status?: string | undefined;
				track?: string | undefined;
				why?: string | undefined;
				nonGoals?: string[] | undefined;
				globalGate?: string | undefined;
				slices?: Array<z.infer<typeof SLICE_IN>> | undefined;
				checkout?: string | undefined;
			}) => {
				// The document belongs in the caller's working
				// tree. The content tree and its per-tree derivatives move
				// with the checkout; the id counter and the lock do not —
				// those are facts about the repository, and a per-worktree
				// copy of either would hand out the same id twice.
				const forCheckout = callerCheckout.writeRoot({
					root: 'caller-checkout',
					serverRoot: options.workspaceRoot,
					requested: args.checkout,
				});
				if (!forCheckout.ok) {
					return toolError(
						forCheckout.refusal,
						'Pass the absolute path of a working tree of this repository, or omit `checkout` to write in the server\u2019s own root.',
					);
				}
				const scoped =
					forCheckout.source === 'request'
						? callerCheckout.scopePaths(options, forCheckout.root, [
								'proposalsDirAbs',
								'indexPathAbs',
							])
						: options;
				const created = await createProposalDocument(
					{
						...args,
						globalGate: (args.globalGate ?? 'none') as
							| 'lint'
							| 'type'
							| 'e2e'
							| 'none',
					},
					scoped,
				);
				if (!created.ok) {
					return toolError(created.reason, created.nextAction);
				}
				// Publication is the tool's job, not an instruction the
				// caller may skip: a proposal only in someone's working
				// copy is invisible to every other agent. Failures are
				// reported, never thrown — the document exists either way.
				// A runner the server built for its own root would commit
				// in the wrong tree. When the caller named a checkout, the
				// commit belongs there; when it did not, nothing changes.
				const serverGit = options.run ?? options.persistGit;
				const git =
					serverGit !== undefined && forCheckout.source === 'request'
						? createGitRunner(forCheckout.root)
						: serverGit;
				// Written into a unit's worktree, the proposal travels with
				// that unit's publication. Publishing it on a ref of its own
				// as well put the same file on two refs, the second one a
				// pull request nobody opened.
				const unitBranch =
					git === undefined
						? undefined
						: await workUnitBranch(
								git,
								options.developmentPolicy?.branches
									.workRefPrefix,
							);
				const publication =
					unitBranch !== undefined
						? {
								published: false,
								reason: `written in the unit on ${unitBranch}: commit it there, and it is published with the unit (\`delendai work publish\`)`,
							}
						: git === undefined
							? {
									published: false,
									reason: 'no git runner is available to this host, so the file must be published by the step in nextAction',
								}
							: await publishProposalOnRef({
									proposalId: created.id,
									title: args.title,
									relativePath: relative(
										scoped.workspaceRoot,
										created.path,
									),
									message: `docs(proposals): add ${created.id}`,
									git,
									commit: createPrivateIndexCommitPort(
										forCheckout.source === 'request'
											? forCheckout.root
											: scoped.workspaceRoot,
									),
									...(options.developmentPolicy === undefined
										? {}
										: {
												policy: {
													requiresPullRequest:
														options
															.developmentPolicy
															.integration
															.requiresPullRequest,
													hasWorkRefs:
														options
															.developmentPolicy
															.branches
															.workRefTemplate
															.length > 0,
													publicationRefPrefix:
														options
															.developmentPolicy
															.branches
															.publicationRefPrefix,
													workRefTemplate:
														options
															.developmentPolicy
															.branches
															.workRefTemplate,
													integration:
														options
															.developmentPolicy
															.branches
															.integration,
													release:
														options
															.developmentPolicy
															.branches.release,
												},
											}),
								});
				// A unit entered for `new` takes the id it was waiting for. The
				// publication above ran under the old name on purpose: it only
				// reads which branch the checkout is on.
				const unit = await adoptCreatedProposalUnit({
					root:
						forCheckout.source === 'request'
							? forCheckout.root
							: scoped.workspaceRoot,
					id: created.id,
					policy: options.developmentPolicy,
				});
				return toolOk({
					id: created.id,
					file: created.file,
					path: created.path,
					disjointnessIssues: created.disjointnessIssues,
					indexCount: created.indexCount,
					redactedSecrets: created.redactedSecrets,
					...(unit.unitBranch === undefined
						? {}
						: { unitBranch: unit.unitBranch }),
					...(unit.unitRenamedFrom === undefined
						? {}
						: { unitRenamedFrom: unit.unitRenamedFrom }),
					nextAction: `${unit.note === undefined ? '' : `${unit.note} `}${created.reused === true ? `${created.id} was already written by an earlier call with this title, so nothing was created again. ` : ''}${
						unitBranch !== undefined
							? `Commit ${relative(scoped.workspaceRoot, created.path)} in the unit on ${unit.unitBranch ?? unitBranch} (run \`bun run gen:all\` first if the project derives files from proposals), then publish the unit with \`delendai work publish\`.`
							: proposalPublishNextAction({
									template: options.publishCommand,
									policy: options.developmentPolicy,
									workspaceRoot: scoped.workspaceRoot,
									absPath: created.path,
									ref: publicationRefFor(
										options.developmentPolicy?.branches
											.publicationRefPrefix ??
											'delendai/pr/',
										created.id,
										{
											title: args.title,
											template:
												options.developmentPolicy
													?.branches.workRefTemplate,
										},
									),
								})
					}`,
					published: publication.published,
					...(publication.ref === undefined
						? {}
						: { publishedRef: publication.ref }),
					...(publication.reason === undefined
						? {}
						: { publishReason: publication.reason }),
				});
			},
		);
	},
});
