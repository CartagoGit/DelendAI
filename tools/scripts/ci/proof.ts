/**
 * proof.ts — the seal a local proof leaves for the pull request to check.
 *
 * `bun run prove` runs the plan CI would run for a change. When it passes,
 * the verdict is kept on the forge as `refs/delendai/proofs/<head sha>`:
 * one small commit per proved head, so agents never contend for one ref.
 * The pull request then checks the seal instead of running the plan again:
 * same tree, same base, same plan. A seal is a claim by whoever pushed it,
 * not a signature; the integration branch's full run after each merge, and
 * a re-check of one sealed pull request in five, catch a wrong one.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import type { IProof, IProofVerdict } from './proof.interface';

export const PROOF_REF_PREFIX = 'refs/delendai/proofs/';

/** One in this many sealed pull requests runs its plan anyway. */
export const RECHECK_ONE_IN = 5;

/** The digest of a zone matrix, as the planner prints it. */
export const planDigestOf = (matrix: string): string =>
	createHash('sha256').update(matrix.trim()).digest('hex');

/** Whether this head is one of the sealed pull requests re-checked in full. */
export const sampledForRecheck = (head: string): boolean =>
	Number.parseInt(head.slice(0, 8), 16) % RECHECK_ONE_IN === 0;

/** Whether a seal stands for the pull request as CI sees it. */
export const judgeProof = (input: {
	readonly proof: IProof | undefined;
	readonly head: string;
	readonly tree: string;
	readonly base: string;
	readonly planDigest: string;
}): IProofVerdict => {
	const { proof } = input;
	if (proof === undefined)
		return {
			proved: false,
			why: 'no local proof was pushed for this head',
		};
	if (!proof.ok) return { proved: false, why: 'the local proof failed' };
	if (proof.tree !== input.tree)
		return { proved: false, why: 'the proved tree is not this head' };
	if (proof.base !== input.base)
		return {
			proved: false,
			why: 'the head was proved against another base; it has moved since',
		};
	if (proof.planDigest !== input.planDigest)
		return {
			proved: false,
			why: 'CI plans this change differently from the proof',
		};
	if (sampledForRecheck(input.head))
		return {
			proved: false,
			why: `sampled: one sealed pull request in ${String(RECHECK_ONE_IN)} runs its plan anyway`,
		};
	return {
		proved: true,
		why: `proved locally (${proof.steps.length} step(s), ${String(proof.seconds)}s)`,
	};
};

const git = (args: readonly string[], input?: string): string =>
	execFileSync('git', args, {
		encoding: 'utf8',
		...(input === undefined ? {} : { input }),
		stdio: ['pipe', 'pipe', 'ignore'],
	}).trim();

/** Store a seal as a commit under its ref, and push it. */
export const recordProof = (proof: IProof, remote = 'origin'): string => {
	const blob = git(
		['hash-object', '-w', '--stdin'],
		`${JSON.stringify(proof, null, '\t')}\n`,
	);
	const tree = git(['mktree'], `100644 blob ${blob}\tproof.json\n`);
	const commit = git(['commit-tree', tree, '-m', `proof of ${proof.head}`]);
	const ref = `${PROOF_REF_PREFIX}${proof.head}`;
	git(['update-ref', ref, commit]);
	git(['push', '--quiet', remote, `${ref}:${ref}`]);
	return ref;
};

/** The seal pushed for `head`, or undefined when there is none. */
export const readProof = (
	head: string,
	remote = 'origin',
): IProof | undefined => {
	const ref = `${PROOF_REF_PREFIX}${head}`;
	try {
		git(['fetch', '--quiet', remote, `${ref}:${ref}`]);
		return JSON.parse(git(['show', `${ref}:proof.json`])) as IProof;
	} catch {
		return undefined;
	}
};
