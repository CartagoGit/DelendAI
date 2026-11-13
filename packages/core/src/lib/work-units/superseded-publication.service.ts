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
import { shortName } from '../integration/decisions/namespaces.helper';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	ISupersession,
	ISupersessionPorts,
} from '../contracts/interfaces/superseded-publication.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IWorkUnitContext } from '../contracts/interfaces/work-unit-context.interface';
import type { IPublicationPullRequest } from '../contracts/interfaces/publication-pull-request.interface';
import type { IUnitHandover } from './unit-lease.interface';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { readWorkspacePolicy } from './development-policy.service';
import { readUnitLease } from './unit-lease.store';
import { retired } from './work-unit-retire.service';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import {
	agentFor,
	integrationRemote,
	readGit,
	workspaceOf,
} from './work-unit-shared.service';
import { publicationRefFromWorkRef } from './work-publish.service';

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
	const seen = new Set<string>([shortName(input.newPublication)]);
	for (const hand of input.handedFrom) {
		const full = publicationRefFromWorkRef(input.policy, hand.ref);
		if (full === undefined) continue;
		const publication = shortName(full);
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
 * The git directory shared by every worktree of `workspace`, read from the
 * files and not by asking git: publish has a budget of git processes, and
 * a unit that took nothing over must not spend any of it here.
 */
export const commonDirFromFiles = async (
	workspace: string,
): Promise<string | undefined> => {
	for (
		let dir = resolve(workspace);
		dir !== dirname(dir);
		dir = dirname(dir)
	) {
		const dot = join(dir, '.git');
		// Read, and let the read say what `.git` is: a directory (EISDIR) is
		// the common directory itself, a missing path is one level too deep.
		// No check before the read, so nothing can change between the two.
		const text = await readFile(dot, 'utf8').then(
			(content) => ({ content }),
			(error: NodeJS.ErrnoException) => error,
		);
		if (text instanceof Error) {
			if (text.code === 'EISDIR') return dot;
			continue;
		}
		const pointer = /^gitdir:\s*(.+)$/mu.exec(text.content)?.[1];
		const at = pointer?.lastIndexOf(`${sep}worktrees${sep}`) ?? -1;
		return pointer === undefined || at < 0
			? undefined
			: pointer.slice(0, at);
	}
	return undefined;
};

/** The hands a unit passed through, from its lease (read BEFORE it is pruned). */
export const handedFromOf = async (
	common: string,
	workRef: string,
): Promise<readonly IUnitHandover[]> =>
	(await readUnitLease(common, workRef.replace(/^refs\/heads\//u, '')))
		?.handedFrom ?? [];

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
	const name = shortName(publication);
	const from = shortName(policy.branches.publicationRefPrefix);
	return `${shortName(policy.branches.workRefPrefix)}${name.slice(from.length)}`;
};

/**
 * Run `publish`; when it published a unit that took over somebody's
 * publication, retire that one if the new one carries its tip, and add
 * what happened to the result as `superseded`. A unit that took nothing
 * over costs no git process.
 */
export const publishedSupersedingOld = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
	publish: (
		args: readonly string[],
		ctx: IWorkUnitContext,
	) => Promise<IWorkUnitResult>,
): Promise<IWorkUnitResult> => {
	// Before: publishing removes the unit's worktree, where all this is read.
	const workspace = workspaceOf(ctx);
	const common = await commonDirFromFiles(workspace);
	const policy =
		common === undefined
			? undefined
			: await readWorkspacePolicy(workspace).catch(() => undefined);
	const result = await publish(args, ctx);
	const data = result.data as
		| {
				readonly published?: boolean;
				readonly tip?: string | null;
				readonly publication?: { readonly ref?: string };
				readonly pullRequest?: IPublicationPullRequest;
		  }
		| undefined;
	const publication = data?.publication?.ref;
	if (
		common === undefined ||
		policy === undefined ||
		data?.published !== true ||
		publication === undefined
	) {
		return result;
	}
	const handedFrom = await handedFromOf(
		common,
		workRefOfPublicationRef(policy, publication),
	);
	if (handedFrom.length === 0) return result;
	const root = dirname(common);
	const superseded = await retireSupersededByPublish({
		root,
		ctx,
		policy,
		remote: ctx.globals.remote ?? integrationRemote(root, policy),
		agent:
			scalarArg(args, 'agent') ?? agentFor(args, root, policy.identity),
		handedFrom,
		published: true,
		newPublication: publication,
		newTip: data.tip ?? null,
		pullRequest: data.pullRequest,
	});
	return superseded.length === 0
		? result
		: { ...result, data: { ...data, superseded } };
};
