/**
 * loop-detection-seam.ts — reuse, never duplicate, the loop detector.
 *
 * AGENTS.md rule 1 says there is ONE loop detector. It lives in the
 * proposals plugin (`plugins/proposals/src/lib/agents/loop-detector-service.ts`,
 * `AgentLoopDetectorService`). The runner must not create a second one.
 *
 * There is no workspace alias from `orchestrator-runner` to `proposals`
 * (that would couple two sibling plugins and violate the plugins-imports
 * lint), so the concrete detector is passed in as an INJECTED DEPENDENCY
 * rather than imported. The host wiring places a structurally-compatible
 * instance at `ctx.options.dependencies.loopDetector`; this resolver reads
 * it defensively and hands back an {@link ILoopDetectionSeam} or
 * `undefined` when nothing was injected.
 *
 * WIRING ASSUMPTION (documented per the S4 brief): in S4 no tool executes
 * an invocation, so the only consumer is `advise_routing`, which uses the
 * seam's `isAgentStuck` to annotate a decision with a `loopWarning` when a
 * session keeps requesting the same route. The full `onToolCall`-driven
 * policing of real invocations is wired in S6 (invoke), where the host
 * injects the same `AgentLoopDetectorService` instance it already builds
 * for the proposals swarm. No new detector, no cross-plugin import.
 */
import type { ILoopDetectionSeam } from './types';

const hasIsAgentStuck = (value: unknown): value is ILoopDetectionSeam =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { isAgentStuck?: unknown }).isAgentStuck === 'function';

/**
 * Extract an injected loop detector from plugin options, or `undefined`.
 * Never throws: a malformed/absent dependency simply means the runner
 * runs without loop annotation (the detector is an enhancement, not a
 * hard requirement for headless advice).
 */
export const resolveLoopDetectionSeam = (
	options: Readonly<Record<string, unknown>>,
): ILoopDetectionSeam | undefined => {
	const dependencies = (options as { dependencies?: Record<string, unknown> })
		.dependencies;
	if (typeof dependencies !== 'object' || dependencies === null) {
		return undefined;
	}
	const candidate = (dependencies as { loopDetector?: unknown }).loopDetector;
	return hasIsAgentStuck(candidate) ? candidate : undefined;
};
