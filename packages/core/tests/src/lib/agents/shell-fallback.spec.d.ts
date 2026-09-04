/**
 * shell-fallback.spec.ts — f00085 S1 + S3.
 *
 * Unit specs for the agent shell-fallback ladder:
 *   - Ring 1 detector: `detectStuckShell` regex/sentinel matching, and
 *     the negative cases (intentional failures must NOT be "stuck").
 *   - The ladder: `withShellFallback` escalation order across the three
 *     rings via an injected driver seam.
 *   - Ring 3 adapter: `mapShellIntentToTool` intent → tool mapping
 *     table, including the fall-through to `null` for uncovered intents.
 *
 * Run: bun test packages/core/tests/src/lib/agents/shell-fallback.spec.ts
 */
export {};
