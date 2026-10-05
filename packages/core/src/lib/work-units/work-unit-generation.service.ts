import { resolveWorkRef } from '../wip-engine/ref-name';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { REVIEW_BATCH_ID } from '../development-policy/profiles.constant';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { publicationRefFromWorkRef } from './work-publish.service';
import { worktreeSession } from './worktree-agent.service';

import {
	readGit,
	kindFor,
	refused,
	sessionFor,
	workRefFor,
} from './work-unit-shared.service';

/** Stands for "any generation" while matching a unit's refs. */
const ANY_GENERATION = '987654321';

/** The session holding the worktree `ref` is checked out in, if any. */
export const sessionHolding = (
	root: string,
	ref: string,
): string | undefined => {
	const block = (readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.find((each) => each.includes(`branch ${ref}`));
	const path = block
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);
	return path === undefined ? undefined : worktreeSession(path);
};

/** True while a publication of `workRef`'s generation exists, here or on a remote. */
const publishedUnder = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	workRef: string,
): boolean => {
	const publication = publicationRefFromWorkRef(policy, workRef);
	if (publication === undefined) return false;
	const unitDir = publication.slice(0, publication.lastIndexOf('/') + 1);
	const branchDir = unitDir.replace(/^refs\/heads\//u, '');
	const found = readGit(root, [
		'for-each-ref',
		'--count=1',
		'--format=%(refname)',
		`${unitDir}*`,
		`refs/remotes/*/${branchDir}*`,
	]);
	return found !== undefined && found.length > 0;
};

/** The generation these arguments name; 1 when they name none. */
export const unitGeneration = (args: readonly string[]): number =>
	Number(scalarArg(args, 'generation') ?? '1');

/**
 * The generation this session works in: the first one no other session
 * holds. Twenty instances of one model are twenty units (x00714): the id
 * names the model, the generation the instance, so each has its own
 * branch, worktree and pull request. A proposal's slice is refused
 * instead, because a second instance on it does the same work twice.
 */
export const chooseGeneration = (
	root: string,
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): { readonly generation: number } | { readonly refusal: IWorkUnitResult } => {
	const session = sessionFor(args);
	// Occupancy is by unit, whatever topic another instance chose.
	const unnamed = args.filter((arg) => !arg.startsWith('--topic='));
	// A session that already holds a unit goes back to it, whichever
	// generation it is. Taking the first free one instead sent a reviewer
	// whose older unit had been retired to a new unit, where it claimed
	// the next proposal, while its verdicts went to the unit its session
	// named, which had claimed nothing.
	if (session !== undefined && scalarArg(args, 'generation') === undefined) {
		const held = unitRefsAnyName(
			root,
			unnamed,
			policy,
			agent,
			proposal,
			slice,
		)
			.filter((ref) => sessionHolding(root, ref) === session)
			.map((ref) => Number(/-g(\d+)\//u.exec(ref)?.[1] ?? Number.NaN))
			.filter((generation) => Number.isInteger(generation));
		if (held.length > 0) return { generation: Math.max(...held) };
	}
	for (let generation = 1; ; generation += 1) {
		const inGeneration = [...unnamed, `--generation=${String(generation)}`];
		const exact = workRefFor(inGeneration, policy, agent, proposal, slice);
		const refs = new Set([
			...unitRefsAnyName(
				root,
				inGeneration,
				policy,
				agent,
				proposal,
				slice,
			),
			...(readGit(root, ['rev-parse', '-q', '--verify', exact]) ===
			undefined
				? []
				: [exact]),
		]);
		const other = [...refs].find((ref) => {
			const holder = sessionHolding(root, ref);
			return holder !== undefined && holder !== session;
		});
		if (other === undefined) {
			// A review batch's name is reused by nobody while its pull
			// request is open: its claims are read back to that name, and a
			// new unit under it took the published pack's proposals for its
			// own.
			if (
				proposal !== REVIEW_BATCH_ID ||
				!publishedUnder(root, policy, exact)
			)
				return { generation };
			continue;
		}
		if (proposal !== REVIEW_BATCH_ID) {
			return {
				refusal: refused(
					`${proposal} ${slice} is being worked on by another session of \`${agent}\` (\`${other}\`): two instances on one slice would do the same work twice.`,
					'If it is your own unit, enter it from inside its worktree, or pass the --session it gave you when you first entered. Otherwise take other work, or pass --generation=<n> to start a deliberate second attempt at it.',
				),
			};
		}
	}
};

/**
 * The refs of one unit whatever their kind and topic, when those were not
 * asked for. A unit is its agent, proposal, slice and generation; the kind
 * and topic only name it. `work publish` without the `--topic` it was
 * entered with rendered `…/work`, found nothing, and the unit was left
 * unpublished.
 */
export const unitRefsAnyName = (
	root: string,
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): readonly string[] => {
	const open: Record<string, string> = {};
	if (scalarArg(args, 'kind') === undefined) open.kind = 'zzanykindzz';
	if (scalarArg(args, 'topic') === undefined) open.topic = 'zzanytopiczz';
	// Instances of one model are told apart by generation (x00714): a
	// unit not asked for by generation is found in any of them.
	if (scalarArg(args, 'generation') === undefined)
		open.generation = ANY_GENERATION;
	if (Object.keys(open).length === 0) return [];
	const rendered = resolveWorkRef(policy.branches.workRefTemplate, {
		agent,
		kind: open.kind ?? kindFor(args, slice),
		proposal,
		slice,
		generation: Number(scalarArg(args, 'generation') ?? ANY_GENERATION),
		...(open.topic === undefined
			? { topic: scalarArg(args, 'topic') ?? '' }
			: { topic: open.topic }),
	});
	const sentinels = Object.values(open);
	const firstOpen = Math.min(
		...sentinels.map((s) => rendered.indexOf(s)).filter((i) => i >= 0),
	);
	if (!Number.isFinite(firstOpen)) return [];
	const prefix = rendered.slice(0, rendered.lastIndexOf('/', firstOpen) + 1);
	let pattern = rendered.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	for (const s of sentinels)
		pattern = pattern.replace(s, s === ANY_GENERATION ? '[0-9]+' : '[^/]+');
	const shape = new RegExp(`^${pattern}$`, 'u');
	return (
		readGit(root, ['for-each-ref', '--format=%(refname)', prefix]) ?? ''
	)
		.split('\n')
		.filter((name) => shape.test(name));
};

/**
 * A refusal when the arguments leave open which of one unit's refs is
 * meant, or `undefined`. Picking one would publish or extend the wrong
 * work; rendering a fresh name would start a second copy of the unit.
 */
export const ambiguousUnit = (
	root: string,
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): IWorkUnitResult | undefined => {
	const rendered = workRefFor(args, policy, agent, proposal, slice);
	if (readGit(root, ['rev-parse', '-q', '--verify', rendered]) !== undefined)
		return undefined;
	const named = unitRefsAnyName(root, args, policy, agent, proposal, slice);
	if (named.length < 2) return undefined;
	const session = sessionFor(args);
	if (
		session !== undefined &&
		named.filter((ref) => sessionHolding(root, ref) === session).length ===
			1
	) {
		return undefined;
	}
	return refused(
		`${proposal} ${slice} of \`${agent}\` has ${named.length} refs: ${named.map((n) => `\`${n}\``).join(', ')}.`,
		'Name yours: pass the --session `work enter` gave you (or DELENDAI_SESSION_ID), or --generation, --kind and --topic.',
	);
};

/**
 * The ref of the unit these arguments name, as it exists in this clone.
 *
 * A unit entered before the shape named its kind lives under the name
 * without the kind segment (f00644). Rendering only the new name would
 * leave it unreachable: it could not be entered again, checkpointed or
 * published. Unless a kind is asked for explicitly, the existing unit is
 * found under the template with its `${kind}/` segment taken out — the
 * same template, read, not re-spelled.
 */
export const existingWorkRef = (
	root: string,
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): string => {
	const ref = workRefFor(args, policy, agent, proposal, slice);
	const exists = (name: string): boolean =>
		readGit(root, ['rev-parse', '-q', '--verify', name]) !== undefined;
	const named = unitRefsAnyName(root, args, policy, agent, proposal, slice);
	// Another instance of the same model may hold the rendered unit: the
	// caller's session names its own (x00714).
	const session = sessionFor(args);
	const own = named.filter((each) => sessionHolding(root, each) === session);
	if (session !== undefined && own.length === 1) return own[0] ?? ref;
	if (exists(ref)) return ref;
	if (named.length === 1) return named[0] ?? ref;
	if (scalarArg(args, 'kind') !== undefined) return ref;
	const template = policy.branches.workRefTemplate;
	const withoutKind = template.replace('${kind}/', '');
	if (withoutKind === template) return ref;
	const legacy = workRefFor(
		args,
		{
			...policy,
			branches: { ...policy.branches, workRefTemplate: withoutKind },
		},
		agent,
		proposal,
		slice,
	);
	return exists(legacy) ? legacy : ref;
};
