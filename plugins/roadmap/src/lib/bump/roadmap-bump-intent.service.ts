import {
	type IConventionalCommit,
	inferBump,
} from '@delendai/changelog/public';

import {
	ROADMAP_BUMP_AUTHORITY,
	ROADMAP_KIND_COMMIT_TYPES,
} from '../contracts/constants/bump-intent.constant';
import type { IRoadmapBumpIntent } from '../contracts/interfaces/bump-intent.interface';
import type {
	IRoadmapBumpDeriver,
	IRoadmapBumpHint,
	IRoadmapEntryKind,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';
import { promisedKinds } from '../validation/bump-hint-validator.service';

/**
 * Stands each kind in as the conventional commit that would ship it, so
 * the changelog plugin's own rule decides the bump. Nothing here ranks
 * kinds against each other.
 */
const asCommit = (
	kind: IRoadmapEntryKind,
	index: number,
): IConventionalCommit => ({
	type: ROADMAP_KIND_COMMIT_TYPES[kind],
	subject: `${kind} entry ${index + 1}`,
	breaking: kind === 'breaking',
	hash: `entry-${index + 1}`,
});

/** What `inferBump` makes of a set of entry kinds. */
export const inferBumpForKinds = (kinds: readonly IRoadmapEntryKind[]) =>
	inferBump(kinds.map(asCommit));

/** The deriver the hint validator is given: it asks `inferBump` and nothing else. */
export const deriveBumpFromKinds: IRoadmapBumpDeriver = (kinds) =>
	inferBumpForKinds(kinds).kind;

/**
 * The bump a horizon's promised entries imply. It is evidence for the
 * release, never a version: `authority` names who decides.
 */
export const buildBumpIntent = (
	horizon: IRoadmapHorizon,
): IRoadmapBumpIntent => {
	const inference = inferBumpForKinds(promisedKinds(horizon));
	const declared: IRoadmapBumpHint | undefined = horizon.bumpHint;
	return {
		kind: inference.kind,
		reason: inference.reason,
		considered: inference.considered,
		authority: ROADMAP_BUMP_AUTHORITY,
		declared,
		coherent: declared === undefined || declared === inference.kind,
	};
};
