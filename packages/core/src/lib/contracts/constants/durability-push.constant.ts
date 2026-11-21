/**
 * durability-push.constant.ts — how a push that only keeps work safe says so.
 */

/**
 * Set to `1` on the pushes delendai makes to keep a unit's branch on the
 * forge (after a commit, at start). A project's pre-push checks that judge
 * a publication (a regenerated tree, the publication proof) may skip such a
 * push: a wip branch is not a publication, and refusing it left the work
 * on one machine. The guard and the integration-branch protections still
 * run on it.
 */
export const DURABILITY_PUSH_VARIABLE = 'DELENDAI_DURABILITY_PUSH';
