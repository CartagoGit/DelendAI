/**
 * Contract shapes for `./profiles`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `profiles.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `profiles.ts`, so no import site changes.
 */

import type { DEVELOPMENT_PROFILES } from './profiles.constant';

export type IDevelopmentProfile = (typeof DEVELOPMENT_PROFILES)[number];
