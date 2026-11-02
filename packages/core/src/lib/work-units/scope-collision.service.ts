/**
 * scope-collision.service.ts — a collision is named before the work
 * starts.
 *
 * `work checkpoint` refused for a missing identity, an invalid scope and
 * an unanchored checkout, and said nothing at all about the one thing
 * another agent can do to you: already be changing the file you are
 * about to claim.
 *
 * The information was there the whole time — `work swarm` prints
 * overlaps, computed from the diffs rather than from claims, precisely
 * because the question "is somebody already changing this" has to be
 * answerable BEFORE the first edit. It simply was not consulted on the
 * path where it matters.
 *
 * A bare refusal would be no better. An agent told "no" guesses, and the
 * guesses are: do it anyway, pick a different file, or stop. So the
 * refusal names who, which unit of work, which paths, and the three
 * answers that are actually available — wait, re-scope, or take the unit
 * over with `work claim`, which renames it and leaves a record.
 */
import type { IScopeCollision } from '../contracts/interfaces/scope-collision.interface';
import type { ISwarmUnit } from '../contracts/interfaces/work-swarm.interface';

export type { IScopeCollision } from '../contracts/interfaces/scope-collision.interface';

/**
 * Whether two paths name overlapping work.
 *
 * Equality is not enough: a scope may claim a directory, and a directory
 * contains the files somebody else is editing. Prefix comparison is done
 * on segment boundaries so `src/app` never collides with `src/applet`.
 */
const touches = (left: string, right: string): boolean =>
	left === right ||
	left.startsWith(`${right}/`) ||
	right.startsWith(`${left}/`);

/**
 * The units of work, other than this agent's own, already changing a
 * path this scope claims.
 *
 * Pure: it compares two lists. What to do about the answer belongs to
 * the caller, and what the answer IS belongs here, where a test can ask
 * it every question without a repository.
 */
export const collisionsWith = (input: {
	readonly scope: readonly string[];
	readonly units: readonly ISwarmUnit[];
	readonly agent: string;
}): readonly IScopeCollision[] =>
	input.units
		// Your own earlier checkpoint is not a collision — it is the same
		// work, and refusing it would make a second slice impossible.
		.filter((unit) => unit.agent !== input.agent)
		.map((unit) => ({
			agent: unit.agent,
			ref: unit.ref,
			subject: unit.subject,
			paths: unit.paths.filter((path) =>
				input.scope.some((claimed) => touches(claimed, path)),
			),
		}))
		.filter((collision) => collision.paths.length > 0);

/** What to tell an agent whose scope is already somebody else's. */
export const describeCollisions = (
	collisions: readonly IScopeCollision[],
): readonly string[] => [
	...collisions.flatMap((collision) => [
		`  ${collision.agent} is already changing ${String(collision.paths.length)} of these path(s), in ${collision.ref}:`,
		...collision.paths.map((path) => `    ${path}`),
	]),
	'',
	'Three answers, and only these three:',
	'  wait        — let them publish; their ref disappears when it lands.',
	'  re-scope    — claim the paths they are not touching, and checkpoint those.',
	'  take it     — `delendai work claim --ref=<their ref>` renames it to you,',
	'                keeps the commit, and leaves a record that it changed hands.',
];
