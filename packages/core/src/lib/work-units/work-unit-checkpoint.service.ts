import {
	anchorFromPolicy,
	anchorRefusal,
	observeAnchor,
} from '../wip-engine/index';
import { validateScopePaths } from '../../plugin';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { collisionsWith, describeCollisions } from './scope-collision.service';
import { readSwarm } from './work-swarm.service';
import { scalarArg } from './command-args.helper';

import {
	agentFor,
	integrationBase,
	kindInAgent,
	openWork,
	refused,
	unknownKind,
} from './work-unit-shared.service';
import { ambiguousUnit, existingWorkRef } from './work-unit-generation.service';

export const checkpointed = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const message = scalarArg(args, 'message');
	const paths = (scalarArg(args, 'paths') ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	const agent = agentFor(args);
	if (
		proposal === undefined ||
		slice === undefined ||
		message === undefined ||
		paths.length === 0 ||
		agent.length === 0
	) {
		return refused(
			'A checkpoint needs an identity, a scope and a message.',
			'work checkpoint --proposal=<id> --slice=<id> --paths=<a,b> --message="..." [--agent=<who>] [--generation=<n>] [--topic=<text>]; --agent defaults to DELENDAI_AGENT_ID.',
		);
	}
	if (policy.branches.workRefTemplate.length === 0) {
		return refused(
			`The \`${policy.profile}\` profile has no work-ref model: it commits to \`${policy.branches.integration}\` directly.`,
			'Commit normally, or switch the project to a profile that isolates work in refs.',
		);
	}
	const scope = validateScopePaths(paths);
	if (scope.invalid.length > 0) {
		return refused(
			`Invalid scope: ${scope.invalid.map((entry) => `${entry.path} (${entry.reason})`).join(', ')}.`,
			'Use repository-relative paths, without traversal and without .git.',
		);
	}
	// A refusal an agent cannot act on is worse than no refusal, so this
	// one names who is already in these paths and what can be done about
	// it. The overlap is read from the diffs the other refs carry, not
	// from a claim table: an agent editing files without having said so
	// still collides with you.
	const collisions = collisionsWith({
		agent,
		scope: scope.valid,
		units: readSwarm({ root, policy }).units,
	});
	if (collisions.length > 0) {
		return refused(
			`This scope is already somebody else's work.`,
			describeCollisions(collisions).join('\n'),
		);
	}
	// The anchor is the whole point: a checkpoint taken while the shared
	// checkout sits somewhere else would record a base nobody agreed on.
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	if (anchor !== undefined) {
		return refused(
			`The checkout is not anchored: ${anchor}`,
			`Return the shared checkout to \`${policy.branches.integration}\` (git switch ${policy.branches.integration}); your work stays in the working tree and in its ref.`,
		);
	}
	const base = integrationBase(root, policy);
	if (base === undefined) {
		return refused(
			`The integration branch \`${policy.branches.integration}\` resolves to no commit in this clone.`,
			'Fetch it (git fetch), or correct development.branches.integration.',
		);
	}
	const badKind = unknownKind(args) ?? kindInAgent(agent);
	if (badKind !== undefined) return badKind;
	const ambiguous = ambiguousUnit(root, args, policy, agent, proposal, slice);
	if (ambiguous !== undefined) return ambiguous;
	const ref = existingWorkRef(root, args, policy, agent, proposal, slice);
	const result = await engine.createOrUpdateWipRef({
		baseSha: base,
		paths: scope.valid,
		ref,
		message,
		...(args.includes('--allow-scope-narrowing')
			? { allowScopeNarrowing: true }
			: {}),
	});
	// `unchanged` is a true answer, not a failure: the scope still hashes
	// to what the ref already carries.
	const ok = result.status === 'created' || result.status === 'unchanged';
	return {
		code: ok ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: result,
	};
};
