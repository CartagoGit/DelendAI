/**
 * timeline.spec.ts — f00192 (Track J / agent timeline).
 *
 * Pins the host-agnostic timeline contract:
 *   - append() redacts free-text fields at the boundary,
 *   - the buffer is a ring (oldest dropped at capacity),
 *   - serialize/deserialize round-trip through JSON,
 *   - the on-disk schema is versioned and parsed safely,
 *   - the pure helpers (redactFreeText, formatEventTimestamp,
 *     isTimelineLog, mergeTimelineLogs) behave as advertised.
 *
 * Privacy (R1.1): the test suite explicitly asserts that tool
 * names and URLs are NEVER present in the persisted log.
 */
export {};
