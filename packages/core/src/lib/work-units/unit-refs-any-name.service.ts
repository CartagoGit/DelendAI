/**
 * unit-refs-any-name.service.ts — the refs of one unit, whatever their
 * kind and topic, under every namespace the policy owns.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	ownedWorkRefShapes,
	unitOfName,
} from '../development-policy/owned-work-ref-parser';
import { alternateTemplate } from '../startup-reconciler/work-ref-identity';
import { sanitizeRefComponent, resolveWorkRef } from '../wip-engine/ref-name';
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
	[
		...new Set(
			ownedWorkRefShapes(policy.branches)
				.flatMap(({ template }) => {
					// A unit entered before the default changed carries the
					// shape it replaced, whichever namespace holds it.
					const replaced = alternateTemplate(template);
					return replaced === undefined
						? [template]
						: [template, replaced];
				})
				.flatMap((template) =>
					unitRefsUnder(root, args, template, agent, proposal, slice),
				),
		),
	];

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
	const asked = Object.keys(open).length === 0;
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
	// Everything named: the one ref this namespace would hold, when it does.
	if (asked) {
		return readGit(root, ['rev-parse', '-q', '--verify', rendered]) ===
			undefined
			? []
			: [rendered];
	}
	const sentinels = Object.values(open);
	const firstOpen = Math.min(
		...sentinels.map((s) => rendered.indexOf(s)).filter((i) => i >= 0),
	);
	if (!Number.isFinite(firstOpen)) return [];
	const prefix = rendered.slice(0, rendered.lastIndexOf('/', firstOpen) + 1);
	// Read each name with the one parser instead of a pattern of the
	// template: the scope grammar omits generation 1, which a pattern for
	// "any generation" cannot match (f00808).
	const kind = open.kind === undefined ? kindFor(args, slice) : undefined;
	const topic =
		open.topic === undefined ? scalarArg(args, 'topic') : undefined;
	const generation =
		open.generation === undefined
			? Number(scalarArg(args, 'generation'))
			: undefined;
	return (
		readGit(root, ['for-each-ref', '--format=%(refname)', prefix]) ?? ''
	)
		.split('\n')
		.filter((name) => {
			const unit = unitOfName(name);
			return (
				unit !== undefined &&
				unit.agent === sanitizeRefComponent(agent) &&
				unit.proposal === sanitizeRefComponent(proposal) &&
				unit.slice === sanitizeRefComponent(slice) &&
				(kind === undefined || unit.kind === kind) &&
				(topic === undefined ||
					unit.topic === sanitizeRefComponent(topic)) &&
				(generation === undefined || unit.generation === generation)
			);
		});
};
