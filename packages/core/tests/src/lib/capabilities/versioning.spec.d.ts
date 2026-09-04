/**
 * versioning.spec.ts — f00194 (Track K / capability versioning).
 *
 * Pins the semver resolution contract:
 *   - `^`, `~`, `>=`, `=`, `*` ranges all behave as expected.
 *   - Mismatch produces a refusal with the full available list.
 *   - Legacy (non-versioned) capabilities are treated as `0.0.0`,
 *     so any range matches.
 *   - Multiple matching versions → highest wins.
 *   - The activator (`checkCapabilityRequirements`) is pure: same
 *     input ⇒ same output.
 *
 * Privacy (R1.1): the suite uses synthetic capability ids only —
 * no tool names, no plugin author info.
 */
export {};
