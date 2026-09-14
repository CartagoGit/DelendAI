/**
 * Contract shapes for `./persistence-route`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `persistence-route.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `persistence-route.ts`, so no import site changes.
 */

import type { HEAD_MOVING_GIT_VERBS } from './persistence-route.constant';

export type IHeadMovingGitVerb = (typeof HEAD_MOVING_GIT_VERBS)[number];
