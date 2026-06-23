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
 *
 * Pure verification harness; no I/O, no network, no writes.
 */

import type { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { assemblePluginForTest } from '../lib/plugin-test-bed';
import { captureToolRegistration } from '../lib/test-mcp-server';
import { formatResultsTable } from './format-results-table';
import {
	HAPPY_PATH_PROBE_IDS,
	runEmptyInputProbe,
	runHappyPathProbe,
	type IProbeResult,
	type IToolHandle,
} from './verify-probes';

const PLUGIN_LIST = [
	'audit',
	'deps',
	'docs',
	'git',
	'logs',
	'memory',
	'notification',
	'proposals',
	'quality',
	'rules',
	'search',
	'status-marker',
	'test-convention',
	'web-fetch',
] as const;

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
): Promise<readonly IVerifyResult[]> => {
	const { tools } = await assemblePluginForTest({
		workspaceRoot,
		pluginName,
		syntheticConfig: {
			validationMatrix: {
				scopes: {
					full: [{ command: 'bun test', expect: 'exit0' }],
				},
			},
		},
	});

	const results: IVerifyResult[] = [];
	for (const t of tools) {
		try {
			const handle = await captureSchemas(t);
			const probe = await runEmptyInputProbe(handle);
			results.push(probeToVerify(pluginName, probe));
		} catch (err) {
			results.push({
				plugin: pluginName,
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
	for (const id of HAPPY_PATH_PROBE_IDS) {
		const t = tools.find((tool) => tool.id === id);
		if (!t) continue;
		try {
			const handle = await captureSchemas(t);
			const probe = await runHappyPathProbe(handle);
			if (probe) results.push(probeToVerify(pluginName, probe));
		} catch (err) {
			results.push({
				plugin: pluginName,
				tool: id,
				schemaCompatible: 'failed',
				handlerReturned: false,
				detail: (err as Error).message,
			});
		}
	}
	return results;
};

const main = async (): Promise<number> => {
	const argv = process.argv.slice(2);
	const pluginArg = argv.find((a) => a.startsWith('--plugin='));
	const list = pluginArg
		? [pluginArg.slice('--plugin='.length)]
		: [...PLUGIN_LIST];
	const workspaceRoot = process.cwd();

	const all: IVerifyResult[] = [];
	for (const name of list) {
		try {
			const res = await verifyPlugin(name, workspaceRoot);
			all.push(...res);
		} catch (err) {
			console.error(
				`[${name}] plugin load failed: ${(err as Error).message}`,
			);
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
	}));
	process.stdout.write(formatResultsTable(rows));
	const totalFailed = rows.filter((r) => r.outcome === 'failed').length;
	return totalFailed === 0 ? 0 : 1;
};

if (import.meta.main) {
	main().then((code) => process.exit(code));
}

export { verifyPlugin };
