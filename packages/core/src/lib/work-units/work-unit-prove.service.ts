/**
 * work-unit-prove.service.ts — `work prove`: run the proof publishing
 * would run, without publishing.
 *
 * A passing proof is remembered by the tree it proved, so the publication
 * that follows — `work publish`, or the hand-over a proposal transition
 * makes over a tool call — does not run it again.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
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
	const { policy } = opened;
	const root = mainWorktreeOf(opened.root);
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args, root, policy.identity);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return refused(
			'Proving needs the unit of work it proves.',
			'work prove --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>].',
		);
	}
	const workRef = existingWorkRef(root, args, policy, agent, proposal, slice);
	const tip = readGit(root, ['rev-parse', '-q', '--verify', workRef]);
	const base = integrationBase(root, policy);
	if (tip === undefined || base === undefined) {
		return refused(
			`${tip === undefined ? workRef : policy.branches.integration} resolves to no commit in this clone.`,
			'Enter the unit first (`work enter`), and fetch the integration branch.',
		);
	}
	const proof = await proveUnit({
		root,
		worktree: worktreeOfRef(root, workRef.replace(/^refs\/heads\//u, '')),
		tipSha: tip,
		integrationSha: base,
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
