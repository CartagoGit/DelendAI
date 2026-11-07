/**
 * dry-run/effect-capability-factory.helper.ts
 *
 * Builds the concrete `IPluginEffectsCapability` handed to plugins via
 * `IMcpPluginContext.effects`. Each factory here re-applies
 * `guardEffectCapability` on EVERY invocation (reading the ambient flag
 * from `dry-run-scope.helper.ts`), not once at construction — the
 * capability instance is built once per plugin at boot, but the guard
 * it enforces must reflect whichever tool call is CURRENTLY running.
 */
import { guardEffectCapability } from './effect-guard.helper';
import { getActiveDryRunFlag } from './dry-run-scope.helper';
import type {
	IGitRunResult,
	IGitRunner,
} from '../contracts/interfaces/git-runner.interface';

/**
 * Wrap a plain `IGitRunner` so every call is gated against the ambient
 * dry-run flag of the tool call currently executing. Because the guard
 * is rebuilt per call rather than baked in once, the SAME returned
 * runner instance safely serves both dry-run and real invocations
 * across different tool calls — a plugin registers it once and every
 * later call is checked against that call's own `args.dryRun`.
 */
export const createDryRunGatedGitRunner = (
	realRunner: IGitRunner,
): IGitRunner => {
	// The wrapper itself is `async` (rather than returning
	// `guardEffectCapability(...)(args)` directly) so a refusal — which
	// `guardEffectCapability` throws SYNCHRONOUSLY — is captured as a
	// rejected promise like every other `IGitRunner` failure, instead of
	// throwing out of the call before its `Promise` is even returned.
	return async (args: readonly string[]): Promise<IGitRunResult> =>
		guardEffectCapability({
			capability: 'git',
			dryRun: getActiveDryRunFlag(),
			perform: realRunner,
			describe: (a) => a.join(' '),
		})(args);
};
