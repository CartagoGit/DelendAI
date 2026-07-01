/**
 * round-context.ts — barrel for the Agent Swarm Governor round-context.
 *
 * The implementation was split (N20) into cohesive modules that no longer
 * share a single 750-line file:
 *   - `round-context-types`   public types + constants
 *   - `round-context-hash`    SHA-256 fingerprints, age, core-doc hashes
 *   - `round-context-sources` filesystem readers + `collectRoundContextSnapshot`
 *   - `round-context-resume`  pure `buildRoundId` / `buildResumeHint`
 *   - `round-context-digest`  digest build + staleness + atomic read/write
 *
 * This barrel re-exports them so existing consumers importing from
 * `./round-context` (and `@mcp-vertex/proposals/lib/swarm/round-context`)
 * are unaffected.
 */

export * from './round-context-types';
export * from './round-context-hash';
export * from './round-context-sources';
export * from './round-context-resume';
export * from './round-context-digest';
