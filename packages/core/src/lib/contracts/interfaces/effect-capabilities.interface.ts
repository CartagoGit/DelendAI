/**
 * effect-capabilities.interface.ts — the dry-run capability-injection
 * layer.
 *
 * `dry-run/effect-guard.helper.ts` proved the primitive: a capability
 * wrapped with `guardEffectCapability` cannot reach its real effect while
 * `dryRun` is true, even when the calling handler never reads
 * `args.dryRun`. That primitive was opt-in — nothing forced a plugin to
 * construct its capabilities through it. This interface is the other
 * half: the typed surface `IMcpPluginContext` hands every plugin so a
 * guarded capability is the ONLY way to reach a mutating effect, not an
 * alternative to importing `node:child_process` directly.
 *
 * Scope, deliberately narrow (YAGNI over speculative generality): only
 * `git` is declared and implemented here. It is the one capability an
 * actual consumer (`plugins/git`'s write tools) needs, and it earns its
 * own field rather than folding into a generic "process spawn" capability
 * because git write flows already carry their own policy layer
 * (protected-branch refusal, force-push authorization — see
 * `shared/git-write.ts`) that a generic spawn primitive would have to
 * either duplicate or lose. Filesystem-write / process-spawn / network-
 * fetch capabilities are natural next additions for other plugins, but
 * are NOT declared here yet: no migrated plugin uses this layer for them
 * today, and shipping unused capability surface would be dead code the
 * next migration would have to re-review anyway. Add them, with their
 * own guarded factory, when a real plugin migrates to need one.
 */
import type { IGitRunner } from './git-runner.interface';

/**
 * Effect capabilities granted to a plugin at register time. Every
 * mutating capability on this surface is ALREADY wrapped so it refuses
 * to run while the CURRENT tool call's `args.dryRun` is `true` — see
 * `dry-run/dry-run-scope.helper.ts` for how the ambient flag is threaded
 * from the router into the capability without the plugin handler having
 * to pass it explicitly.
 */
export interface IPluginEffectsCapability {
	/**
	 * Run a git subcommand. Dry-run-gated: while the active tool call's
	 * `args.dryRun` is `true`, invoking this throws
	 * `DryRunEffectRefusedError` instead of running `git`. Intended for
	 * WRITE flows (`git commit`, `git push`, ...); a plugin's read-only
	 * traffic never sets `dryRun` and can keep using its own read-only
	 * runner — routing it through this capability too is harmless (the
	 * gate is a no-op whenever `dryRun` is not `true`) but not required.
	 */
	readonly git: IGitRunner;
}
