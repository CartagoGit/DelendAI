/**
 * unit-refs-any-name.service.ts — the refs of one unit, whatever their
 * kind and topic, under every namespace the policy owns.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { ownedWorkRefShapes } from '../development-policy/owned-work-ref-parser';
import { resolveWorkRef } from '../wip-engine/ref-name';
import { scalarArg } from './command-args.helper';
import { kindFor, readGit } from './work-unit-shared.service';

/** Stands for "any generation" while matching a unit's refs. */
const ANY_GENERATION = '987654321';

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
): readonly string[] =>
	// Under every owned namespace: a unit entered before a namespace
	// change is still the same unit (f00808).
	ownedWorkRefShapes(policy.branches).flatMap(({ template }) =>
		unitRefsUnder(root, args, template, agent, proposal, slice),
	);

const unitRefsUnder = (
	root: string,
	args: readonly string[],
	template: string,
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
	const rendered = resolveWorkRef(template, {
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
