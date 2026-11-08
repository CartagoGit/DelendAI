/**
 * superseded-publication.service.ts — a claim never leaves its old pull
 * request open.
 *
 * ROOT CAUSE (x01054): `work claim --ref=<publication>` on an ended unit
 * opens a new generation under the claimant's name and, when published, a
 * NEW pull request, and nothing ever looked back at the old publication.
 * It stayed open beside the new one three times in one day (#1858, #1859,
 * #1860), each carrying the same work twice into the queue.
 *
 * The publication is retired once the new one demonstrably carries it:
 * the old tip is an ancestor of the new one. Retiring keeps the tip on
 * the forge, so the check is not what protects the work; it is what keeps
 * a pull request open whose commits the new one lacks. When it does not
 * hold, the old publication stays and the answer says why.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	ISupersession,
	ISupersessionPorts,
} from '../contracts/interfaces/superseded-publication.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IWorkUnitContext } from '../contracts/interfaces/work-unit-context.interface';
import type { IPublicationPullRequest } from '../contracts/interfaces/publication-pull-request.interface';
import type { IUnitHandover } from './unit-lease.interface';
import { gitCommonDirOf } from './unit-lease.service';
import { readUnitLease } from './unit-lease.store';
import { retired } from './work-unit-retire.service';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import {
	agentFor,
	integrationRemote,
	mainWorktreeOf,
	openWork,
	readGit,
} from './work-unit-shared.service';
import { publicationRefFromWorkRef } from './work-publish.service';

const short = (ref: string): string =>
	ref.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The number of a pull request from its URL, when it ends in one. */
export const pullRequestNumberOf = (url: string): number | undefined => {
	const found = /\/(\d+)\/?$/u.exec(url)?.[1];
	return found === undefined ? undefined : Number(found);
};

/**
 * Retire each publication the hands before the claimant left behind, when
 * the new publication (`newTip`, pull request `number`) contains its tip.
 */
export const retireSupersededPublications = async (input: {
	readonly handedFrom: readonly IUnitHandover[];
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly newPublication: string;
	readonly newTip: string;
	readonly number: number | undefined;
	readonly ports: ISupersessionPorts;
}): Promise<readonly ISupersession[]> => {
	const { ports } = input;
	const outcomes: ISupersession[] = [];
	const seen = new Set<string>([short(input.newPublication)]);
	for (const hand of input.handedFrom) {
		const full = publicationRefFromWorkRef(input.policy, hand.ref);
		if (full === undefined) continue;
		const publication = short(full);
		if (seen.has(publication)) continue;
		seen.add(publication);
		const tip =
			ports.git([
				'rev-parse',
				'-q',
				'--verify',
				`refs/remotes/${input.remote}/${publication}^{commit}`,
			]) ??
			ports.git([
				'rev-parse',
				'-q',
				'--verify',
				`refs/heads/${publication}^{commit}`,
			]);
		// Nothing to supersede: it is gone already.
		if (tip === undefined || tip.length === 0) continue;
		if (input.number === undefined) {
			outcomes.push({
				publication,
				retired: false,
				reason: 'kept: the new publication has no pull request number to name in the reason',
			});
			continue;
		}
		if (
			ports.git(['merge-base', '--is-ancestor', tip, input.newTip]) ===
			undefined
		) {
			outcomes.push({
				publication,
				retired: false,
				reason: `kept: #${String(input.number)} does not contain its tip ${tip.slice(0, 12)}, so closing it would drop commits the new pull request lacks`,
			});
			continue;
		}
		const refusal = await ports.retire(
			publication,
			`superseded by #${String(input.number)}`,
		);
		outcomes.push(
			refusal === undefined
				? {
						publication,
						retired: true,
						reason: `superseded by #${String(input.number)}`,
					}
				: { publication, retired: false, reason: `kept: ${refusal}` },
		);
	}
	return outcomes;
};

/**
 * The hands a unit passed through, read BEFORE publishing: ending the
 * unit may end its lease, and the lease is what remembers them.
 */
export const handedFromOf = async (
	root: string,
	workRef: string,
): Promise<readonly IUnitHandover[]> => {
	const common = gitCommonDirOf(root);
	if (common === undefined) return [];
	const lease = await readUnitLease(
		common,
		workRef.replace(/^refs\/heads\//u, ''),
	);
	return lease?.handedFrom ?? [];
};

/** Publish's step: retire what the new publication superseded, for real. */
export const retireSupersededByPublish = async (input: {
	readonly root: string;
	readonly ctx: IWorkUnitContext;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly agent: string;
	readonly handedFrom: readonly IUnitHandover[];
	readonly published: boolean;
	readonly newPublication: string;
	readonly newTip: string | null;
	readonly pullRequest: IPublicationPullRequest | undefined;
	/** How a publication is retired; `work retire` by default. */
	readonly retire?: ISupersessionPorts['retire'];
}): Promise<readonly ISupersession[]> => {
	if (
		input.handedFrom.length === 0 ||
		!input.published ||
		input.newTip === null
	) {
		return [];
	}
	const { pullRequest } = input;
	return retireSupersededPublications({
		handedFrom: input.handedFrom,
		policy: input.policy,
		remote: input.remote,
		newPublication: input.newPublication,
		newTip: input.newTip,
		number:
			pullRequest !== undefined && 'url' in pullRequest
				? pullRequestNumberOf(pullRequest.url)
				: undefined,
		ports: {
			git: (args) => readGit(input.root, args),
			retire:
				input.retire ??
				((publication, reason) =>
					retireByCommand(input, publication, reason)),
		},
	});
};

const retireByCommand = async (
	input: {
		readonly ctx: IWorkUnitContext;
		readonly agent: string;
	},
	publication: string,
	reason: string,
): Promise<string | undefined> => {
	const result = await retired(
		[
			`--ref=${publication}`,
			`--reason=${reason}`,
			`--agent=${input.agent}`,
			'--unowned',
		],
		input.ctx,
	);
	return result.code === EXIT_CODE.OK
		? undefined
		: (result.error ?? 'retire was refused');
};

/** The work ref a publication was made from: the prefixes swapped. */
export const workRefOfPublicationRef = (
	policy: IResolvedDevelopmentPolicy,
	publication: string,
): string => {
	const bare = (prefix: string): string =>
		prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');
	const name = bare(publication);
	const from = bare(policy.branches.publicationRefPrefix);
	return `${bare(policy.branches.workRefPrefix)}${name.slice(from.length)}`;
};

/**
 * After `work publish` ended a unit that took over somebody's
 * publication: retire that one if the new one carries its tip, and add
 * what happened to the result as `superseded`. The result of a publish
 * that published nothing is returned as it is.
 */
export const withSupersededRetired = async (
	result: IWorkUnitResult,
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const data = result.data as
		| {
				readonly published?: boolean;
				readonly tip?: string | null;
				readonly publication?: { readonly ref?: string };
				readonly pullRequest?: IPublicationPullRequest;
		  }
		| undefined;
	const publication = data?.publication?.ref;
	if (data?.published !== true || publication === undefined) return result;
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return result;
	const root = mainWorktreeOf(opened.root);
	const superseded = await retireSupersededByPublish({
		root,
		ctx,
		policy: opened.policy,
		remote: ctx.globals.remote ?? integrationRemote(root, opened.policy),
		agent:
			scalarArg(args, 'agent') ??
			agentFor(args, root, opened.policy.identity),
		handedFrom: await handedFromOf(
			root,
			workRefOfPublicationRef(opened.policy, publication),
		),
		published: true,
		newPublication: publication,
		newTip: data.tip ?? null,
		pullRequest: data.pullRequest,
	});
	return superseded.length === 0
		? result
		: { ...result, data: { ...data, superseded } };
};
