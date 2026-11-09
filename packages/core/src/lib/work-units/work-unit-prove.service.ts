/**
 * work-unit-prove.service.ts — `work prove`: run the proof publishing
 * would run, without publishing.
 *
 * A passing proof is remembered by the tree it proved, so the publication
 * that follows — `work publish`, or the hand-over a proposal transition
 * makes over a tool call — does not run it again.
 */
import { unitPolicy } from '../development-policy/owned-work-ref-parser';
import { argumentsRefused } from './work-arguments.helper';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { publicationRefFromWorkRef } from './work-publish.service';
import { worktreeOfRef } from './unit-removal.service';
import { existingWorkRef } from './work-unit-generation.service';
import { describeFailedProof, proveUnit } from './work-unit-proof.service';
import {
	agentFor,
	integrationBase,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

export const proved = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	let { policy } = opened;
	const root = mainWorktreeOf(opened.root);
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args, root, policy.identity);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return argumentsRefused('prove');
	}
	const workRef = existingWorkRef(root, args, policy, agent, proposal, slice);
	// A unit under a former namespace is published in its own (f00808).
	policy = unitPolicy(policy, workRef);
	const tip = readGit(root, ['rev-parse', '-q', '--verify', workRef]);
	const base = integrationBase(root, policy);
	if (tip === undefined || base === undefined) {
		return refused(
			`${tip === undefined ? workRef : policy.branches.integration} resolves to no commit in this clone.`,
			'Enter the unit first (`work enter`), and fetch the integration branch.',
		);
	}
	const worktree = worktreeOfRef(
		root,
		workRef.replace(/^refs\/heads\//u, ''),
	);
	const publication = publicationRefFromWorkRef(policy, workRef);
	// Where the unit stands, proved or not: `work deliver` asks this first,
	// so it works from any directory.
	if (args.includes('--locate')) {
		return {
			code: EXIT_CODE.OK,
			data: {
				workRef,
				...(worktree === undefined ? {} : { worktree }),
				...(publication === undefined ? {} : { publication }),
			},
		};
	}
	const proof = await proveUnit({
		root,
		worktree,
		tipSha: tip,
		integrationSha: base,
		urgency: { args, proposal, policy },
	});
	if (!proof.passed) {
		return refused(
			describeFailedProof(proof).replace(
				'was NOT published',
				'was not proved',
			),
			'Fix what failed, commit it in the unit, and prove again.',
		);
	}
	return {
		code: EXIT_CODE.OK,
		data: {
			workRef,
			...(worktree === undefined ? {} : { worktree }),
			proved: proof.declared,
			remembered: proof.remembered === true,
			...(proof.declared
				? {}
				: {
						nextAction:
							'Nothing is declared to prove a unit: add a `prove` script to package.json, or `validationMatrix.scopes` to delendai.config.json.',
					}),
		},
	};
};
