#!/usr/bin/env bun
/**
 * plugin-tool-verify.script.ts
 *
 * Smoke test for every plugin in `plugins/*`: load it through the
 * canonical `assembleCliConfig` path (the same path the host uses at
 * boot), then invoke each tool's handler with an empty `{}` payload
 * (the safest default for read-only tools) and assert the response
 * matches its declared `outputSchema` via Zod. The goal is to catch
 * the failure mode where a tool's handler signature drifted from
 * its `outputSchema` (a common refactor miss — adding a field to
 * the schema but not to the implementation, or vice versa).
 *
 * Why not just rely on per-plugin spec files? Because those specs
 * cover the happy paths and the edge cases the plugin author
 * thought of. This harness exercises the cross-cutting contract
 * — every tool's `outputSchema` must match its handler — which
 * per-plugin specs almost never check.
 *
 * Usage:
 *   bun tools/scripts/verify/plugin-tool-verify.script.ts            # all plugins
 *   bun tools/scripts/verify/plugin-tool-verify.script.ts --plugin=audit
 *   bun tools/scripts/verify/plugin-tool-verify.script.ts --workspace=/abs/repo
 *
 * `--workspace` (r00003 S5 / TS-01) lets the harness run from ANY cwd:
 * plugins are resolved against the injected workspace root and contained
 * with `resolveWorkspaceContained`, not against this script's own path.
 *
 * Pure verification harness; no I/O, no network, no writes.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
	type IToolRegistration,
	resolveWorkspaceContained,
} from '@mcp-vertex/core/public';

import { assemblePluginForTest } from '../lib/plugin-test-bed';
import { captureToolRegistration } from '../lib/test-mcp-server';
import { formatResultsTable } from './format-results-table';
import {
	HAPPY_PATH_PROBE_IDS,
	runEmptyInputProbe,
	runErrorEnvelopeProbe,
	runHappyPathProbe,
	type IProbeResult,
	type IToolHandle,
} from './verify-probes';

/**
 * x00105 S1: the plugin list is DERIVED from `plugins/*` on disk — the
 * previous hardcoded array omitted 5 existing plugins and needed a
 * hand edit for every new one (the exact anti-pattern the bootstrap
 * bans). A plugin that genuinely cannot boot in the bed gets an entry
 * here with the reason; everything else is verified automatically.
 */
const SKIPPED_PLUGINS: Readonly<Record<string, string>> = {};

export const discoverPlugins = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const pluginsDir = join(workspaceRoot, 'plugins');
	const entries = await readdir(pluginsDir, { withFileTypes: true }).catch(
		() => [],
	);
	const names: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const pkg = await stat(
			join(pluginsDir, entry.name, 'package.json'),
		).catch(() => null);
		if (pkg?.isFile()) names.push(entry.name);
	}
	return names.sort();
};

/**
 * Capture the input/output zod schemas the tool registered with the
 * MCP SDK. Solid-DRY: the fake-server scaffold now lives in
 * `lib/test-mcp-server.ts` and is shared with the type-generator and
 * any future caller that wants to exercise a tool handler.
 *
 * Solid-ISP: returns the `IToolHandle` interface from verify-probes,
 * so the probe functions can be unit-tested with a fake handle.
 */
const captureSchemas = (tool: IToolRegistration): Promise<IToolHandle> =>
	captureToolRegistration(tool);

interface IVerifyResult {
	readonly plugin: string;
	readonly tool: string;
	readonly schemaCompatible: 'ok' | 'needs-input' | 'failed';
	readonly handlerReturned: boolean;
	readonly detail?: string;
}

/** Internal: convert an IProbeResult to the legacy IVerifyResult shape. */
const probeToVerify = (
	pluginName: string,
	probe: IProbeResult,
): IVerifyResult => ({
	plugin: pluginName,
	tool: probe.tool,
	schemaCompatible: probe.outcome,
	handlerReturned: probe.handlerReturned,
	...(probe.detail !== undefined ? { detail: probe.detail } : {}),
});

/**
 * Solid-SRP orchestrator: load the plugin (delegated to the test bed),
 * run the empty-input probe on every tool, then the happy-path probe
 * on the tools that require real input. Each probe is a pure function
 * in its own module; this function only sequences them.
 */
const verifyPlugin = async (
	pluginName: string,
	workspaceRoot: string,
	// x00105: the core tool surface is identical in every bed — probe it
	// once (first plugin) instead of 20 times, and label those rows
	// `core` so the table stops implying each plugin re-verified them.
	includeCoreTools: boolean,
): Promise<readonly IVerifyResult[]> => {
	const assemble = (pluginNames: string) =>
		assemblePluginForTest({
			workspaceRoot,
			pluginName: pluginNames,
			syntheticConfig: {
				validationMatrix: {
					scopes: {
						full: [{ command: 'bun test', expect: 'exit0' }],
					},
				},
			},
		});

	// x00105: plugins may declare runtime dependencies ("plugin X
	// requires Y (not in load set)"). Resolve the chain generically by
	// parsing the structured load error and re-assembling with the
	// missing peer prepended — bounded, no hardcoded dependency map.
	let loadSet = pluginName;
	let bed = await assemble(loadSet);
	for (
		let attempt = 0;
		attempt < 4 && bed.loadErrors.length > 0;
		attempt += 1
	) {
		const missing = bed.loadErrors
			.map(
				(message) =>
					/requires "([^"]+)" \(not in load set\)/.exec(message)?.[1],
			)
			.find((name): name is string => name !== undefined);
		if (missing === undefined || loadSet.split(',').includes(missing)) {
			break;
		}
		loadSet = `${missing},${loadSet}`;
		bed = await assemble(loadSet);
	}
	const { tools, loadErrors } = bed;

	// x00105 S1: a plugin that failed to LOAD is a failed verification,
	// not an invisible no-op — this exact swallow is how the gate spent
	// months green while probing zero plugin-owned tools.
	if (loadErrors.length > 0) {
		return loadErrors.map((message) => ({
			plugin: pluginName,
			tool: '(plugin-load)',
			schemaCompatible: 'failed' as const,
			handlerReturned: false,
			detail: message,
		}));
	}

	// Plugin-owned registrations carry the qualified `<prefix>_<plugin>_…`
	// id; core tools keep their bare id.
	const pluginOwned = tools.filter((t) => t.id.includes(`_${pluginName}_`));
	const results: IVerifyResult[] = [];
	if (pluginOwned.length === 0) {
		results.push({
			plugin: pluginName,
			tool: '(no-plugin-tools)',
			schemaCompatible: 'failed',
			handlerReturned: false,
			detail: `plugin loaded but registered no plugin-owned tools (expected ids matching *_${pluginName}_*)`,
		});
	}

	const probeSet = includeCoreTools ? tools : pluginOwned;
	for (const t of probeSet) {
		const label = pluginOwned.includes(t) ? pluginName : 'core';
		try {
			const handle = await captureSchemas(t);
			// Repo hard rule #8: every public tool declares an
			// outputSchema. A missing one is a failed row, not a shrug.
			if (handle.outputSchema === undefined) {
				results.push({
					plugin: label,
					tool: t.id,
					schemaCompatible: 'failed',
					handlerReturned: false,
					detail: 'no outputSchema declared (AGENTS.md rule 8)',
				});
				continue;
			}
			// x00107: every declared outputSchema must accept the
			// canonical toolError envelope — static, covers needs-input
			// tools whose error path no invocation probe reaches.
			const envelope = runErrorEnvelopeProbe(handle);
			if (envelope !== null) results.push(probeToVerify(label, envelope));
			const probe = await runEmptyInputProbe(handle);
			results.push(probeToVerify(label, probe));
		} catch (err) {
			results.push({
				plugin: label,
				tool: t.id,
				schemaCompatible: 'failed',
				handlerReturned: false,
				detail: (err as Error).message,
			});
		}
	}

	// Happy-path probe (Solid-OCP): the probe inputs live in
	// verify-probes.ts; new tools extend the KNOWN_PROBE_INPUTS map
	// and HAPPY_PATH_PROBE_IDS list, this orchestrator never changes.
	// The known ids are all core tools, so this runs on the core pass.
	if (includeCoreTools) {
		for (const id of HAPPY_PATH_PROBE_IDS) {
			const t = tools.find((tool) => tool.id === id);
			if (!t) continue;
			try {
				const handle = await captureSchemas(t);
				const probe = await runHappyPathProbe(handle);
				if (probe) results.push(probeToVerify('core', probe));
			} catch (err) {
				results.push({
					plugin: 'core',
					tool: id,
					schemaCompatible: 'failed',
					handlerReturned: false,
					detail: (err as Error).message,
				});
			}
		}
	}
	return results;
};

/**
 * Solid-SRP: pure parser for the verify script's CLI flags. Kept
 * here (not in `format-results-table` or anywhere else) because the
 * parser is intrinsic to this entrypoint — moving it would couple
 * the formatter to a single consumer.
 *
 * Returns a typed options object so the rest of `main()` never
 * touches `process.argv` directly (DIP: `main` depends on the
 * parsed shape, not on the raw argv).
 */
export interface IVerifyCliOptions {
	readonly pluginFilter: string | undefined;
	/**
	 * Workspace root the plugins are resolved against. Supplied via
	 * `--workspace=<abs>`; when omitted the caller falls back to
	 * `process.cwd()`. r00003 S5 (TS-01): making this an explicit option
	 * lets the script run from ANY cwd, not only from
	 * `tools/scripts/verify/`.
	 */
	readonly workspace: string | undefined;
}

const lastFlagValue = (
	argv: readonly string[],
	prefix: string,
): string | undefined => {
	const arg = [...argv]
		.reverse()
		.find((a: string): boolean => a.startsWith(prefix));
	return arg !== undefined ? arg.slice(prefix.length) : undefined;
};

export const parseVerifyCliArgs = (
	argv: readonly string[],
): IVerifyCliOptions => {
	// `findLast` (ES2023, available in Bun) gives us last-write-wins
	// semantics: when the user passes `--plugin=audit --plugin=rules`,
	// the rightmost one wins (matches typical CLI conventions: a
	// later flag overrides an earlier one). Pinned by the spec at
	// tools/scripts/verify/plugin-tool-verify.script.spec.ts.
	return {
		pluginFilter: lastFlagValue(argv, '--plugin='),
		workspace: lastFlagValue(argv, '--workspace='),
	};
};

/**
 * r00003 S5 (TS-01, DIP): resolve a plugin name to its source root
 * **relative to the injected workspace root**, not to a relative path
 * baked into this script's own location. The name is contained with
 * `resolveWorkspaceContained`, so a malicious or mistaken
 * `--plugin=../../etc` cannot make the harness import code from outside
 * the workspace.
 *
 * Returns the contained, absolute plugin root on success; throws with a
 * structured reason when the name escapes the workspace.
 */
export interface IPluginRootResolver {
	resolve(pluginName: string): string;
}

export const createWorkspacePluginRootResolver = (
	workspaceRoot: string,
): IPluginRootResolver => ({
	resolve(pluginName) {
		// Contain the plugin name FIRST: an absolute name or a `..`
		// traversal must be rejected before it is ever joined to the
		// `plugins/` prefix (otherwise `plugins//etc/evil` would resolve
		// back inside the workspace and slip through).
		const containedName = resolveWorkspaceContained(
			workspaceRoot,
			pluginName,
		);
		if (!containedName.ok) {
			throw new Error(
				`plugin "${pluginName}" resolves outside the workspace: ${containedName.reason}`,
			);
		}
		const containedRoot = resolveWorkspaceContained(
			workspaceRoot,
			`plugins/${pluginName}`,
		);
		if (!containedRoot.ok) {
			throw new Error(
				`plugin "${pluginName}" resolves outside the workspace: ${containedRoot.reason}`,
			);
		}
		return containedRoot.abs;
	},
});

const main = async (): Promise<number> => {
	const options = parseVerifyCliArgs(process.argv.slice(2));
	// r00003 S5 (TS-01): the workspace root comes from `--workspace`, with
	// `process.cwd()` as a boot-time fallback. Resolving it here (a single
	// CLI entrypoint) is the one place a cwd read is acceptable; everything
	// downstream takes the resolved root as an argument.
	const workspaceRoot = options.workspace ?? process.cwd();
	const discovered = await discoverPlugins(workspaceRoot);
	const list =
		options.pluginFilter !== undefined
			? [options.pluginFilter]
			: discovered.filter((name) => {
					const reason = SKIPPED_PLUGINS[name];
					if (reason !== undefined) {
						console.error(`[${name}] skipped: ${reason}`);
						return false;
					}
					return true;
				});
	const rootResolver = createWorkspacePluginRootResolver(workspaceRoot);

	const all: IVerifyResult[] = [];
	let includeCoreTools = true;
	for (const name of list) {
		try {
			// Contain the plugin name before doing any I/O: a name that
			// escapes the workspace is rejected here, not after a load.
			rootResolver.resolve(name);
			const res = await verifyPlugin(
				name,
				workspaceRoot,
				includeCoreTools,
			);
			includeCoreTools = false;
			all.push(...res);
		} catch (err) {
			// x00105 S1: a thrown load path is a FAILED result, not a
			// console note the exit code ignores.
			all.push({
				plugin: name,
				tool: '(plugin-load)',
				schemaCompatible: 'failed',
				handlerReturned: false,
				detail: (err as Error).message,
			});
		}
	}

	// Solid-SRP: presentation is delegated to formatResultsTable.
	// Tests pin the table output; new sinks (JSON / Slack) extend the
	// formatter module, this main() never changes.
	const rows = all.map((r) => ({
		plugin: r.plugin,
		tool: r.tool,
		outcome: r.schemaCompatible,
		handlerReturned: r.handlerReturned,
		...(r.detail !== undefined ? { detail: r.detail } : {}),
	}));
	process.stdout.write(formatResultsTable(rows));
	const totalFailed = rows.filter((r) => r.outcome === 'failed').length;
	return totalFailed === 0 ? 0 : 1;
};

if (import.meta.main) {
	main().then((code) => process.exit(code));
}

export { verifyPlugin };
