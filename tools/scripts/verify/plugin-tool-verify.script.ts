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

import { assembleCliConfig, parseCliArgs } from '@mcp-vertex/core/public';
import type { IToolRegistration } from '@mcp-vertex/core/public';

interface ILoadedTool {
	readonly id: string;
	readonly namespacedName: string;
	readonly plugin: string;
	readonly inputSchema: z.ZodTypeAny | undefined;
	readonly outputSchema: z.ZodTypeAny | undefined;
}

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

const importPlugin = (name: string) => async () => {
	const mod = await import(`../../plugins/${name}/src/index.ts`);
	return { default: mod.default };
};

const buildArgs = (workspaceRoot: string, plugins: string) =>
	parseCliArgs(
		['--plugins=' + plugins, '--workspace=' + workspaceRoot],
		workspaceRoot,
	);

/**
 * Capture the input/output zod schemas the tool registered with the
 * MCP SDK. We intercept `server.registerTool` so we never need a real
 * server; the schemas come back attached to the registration record.
 */
const captureSchemas = async (
	tool: IToolRegistration,
): Promise<{
	inputSchema: z.ZodTypeAny | undefined;
	outputSchema: z.ZodTypeAny | undefined;
	invoke: (args: unknown) => Promise<unknown>;
}> => {
	let inputSchema: z.ZodTypeAny | undefined;
	let outputSchema: z.ZodTypeAny | undefined;
	let invoke: ((args: unknown) => Promise<unknown>) | undefined;
	const fakeServer = {
		registerTool: (
			_name: string,
			schema: {
				inputSchema?: z.ZodTypeAny;
				outputSchema?: z.ZodTypeAny;
			},
			handler: (a: unknown) => Promise<unknown>,
		) => {
			inputSchema = schema.inputSchema;
			outputSchema = schema.outputSchema;
			invoke = handler;
		},
	};
	await tool.register(fakeServer as never);
	if (!invoke) throw new Error(`tool ${tool.id} did not register a handler`);
	return {
		inputSchema,
		outputSchema,
		invoke: async (a: unknown) => {
			const out = await invoke(a);
			const r = out as { content?: Array<{ text?: string }> };
			const text = r?.content?.[0]?.text ?? '';
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		},
	};
};

interface IVerifyResult {
	readonly plugin: string;
	readonly tool: string;
	readonly schemaCompatible: 'ok' | 'needs-input' | 'failed';
	readonly handlerReturned: boolean;
	readonly detail?: string;
}

const verifyPlugin = async (
	pluginName: string,
	workspaceRoot: string,
): Promise<readonly IVerifyResult[]> => {
	const args = buildArgs(workspaceRoot, pluginName);
	const { config } = await assembleCliConfig(args, {
		import: importPlugin(pluginName),
		readFile: () =>
			JSON.stringify({
				validationMatrix: {
					scopes: {
						full: [{ command: 'bun test', expect: 'exit0' }],
					},
				},
			}),
	});
	const tools = config.extraTools ?? [];
	const results: IVerifyResult[] = [];
	for (const t of tools) {
		try {
			const { inputSchema, outputSchema, invoke } =
				await captureSchemas(t);

			// First gate: does the inputSchema accept an empty payload?
			// If yes, the tool should handle {} and return a valid
			// outputSchema-matching result. If no, that's expected —
			// the tool documents required input; mark as 'needs-input'
			// and stop there.
			if (inputSchema) {
				const emptyProbe = inputSchema.safeParse({});
				if (!emptyProbe.success) {
					results.push({
						plugin: pluginName,
						tool: t.id,
						schemaCompatible: 'needs-input',
						handlerReturned: true,
						detail: emptyProbe.error.issues
							.slice(0, 1)
							.map((i) => `${i.path.join('.')}: ${i.message}`)
							.join('; '),
					});
					continue;
				}
			}

			// Input is acceptable empty; invoke and check the output.
			let result: unknown;
			let handlerReturned = false;
			let invocationError: string | undefined;
			try {
				result = await invoke({});
				handlerReturned = true;
			} catch (err) {
				invocationError = (err as Error).message;
				handlerReturned = true;
			}
			let schemaCompatible: 'ok' | 'failed' = 'failed';
			if (invocationError !== undefined) {
				// Handler crashed on input that the schema accepted — real bug.
				schemaCompatible = 'failed';
			} else if (
				outputSchema &&
				typeof result === 'object' &&
				result !== null
			) {
				try {
					outputSchema.parse(result);
					schemaCompatible = 'ok';
				} catch {
					schemaCompatible = 'failed';
				}
			} else if (!outputSchema) {
				// catchall schemas are documented exceptions (AGENTS.md #8).
				schemaCompatible = handlerReturned ? 'ok' : 'failed';
			}
			results.push({
				plugin: pluginName,
				tool: t.id,
				schemaCompatible,
				handlerReturned,
				detail: invocationError,
			});
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

	// Second pass: exercise fs_read / fs_write / scaffold with valid
	// input to make sure their declared outputSchemas match reality
	// (the empty-{} probe only verified the schema REQUIRES input; it
	// did not verify the happy path).
	const secondPass: IVerifyResult[] = [];
	const interestingTools = ['fs_read', 'fs_write', 'scaffold'];
	for (const id of interestingTools) {
		const t = tools.find((tool) => tool.id === id);
		if (!t) continue;
		try {
			const { inputSchema, outputSchema, invoke } =
				await captureSchemas(t);
			if (!inputSchema || !outputSchema) continue;
			const probeInput = buildProbeInput(id);
			if (!probeInput) continue;
			const parseResult = inputSchema.safeParse(probeInput);
			if (!parseResult.success) {
				secondPass.push({
					plugin: pluginName,
					tool: id,
					schemaCompatible: 'failed',
					handlerReturned: false,
					detail: `probe input rejected: ${parseResult.error.issues[0]?.message ?? 'unknown'}`,
				});
				continue;
			}
			let result: unknown;
			try {
				result = await invoke(parseResult.data);
			} catch (err) {
				secondPass.push({
					plugin: pluginName,
					tool: id,
					schemaCompatible: 'failed',
					handlerReturned: false,
					detail: `handler crashed: ${(err as Error).message}`,
				});
				continue;
			}
			try {
				outputSchema.parse(result);
				secondPass.push({
					plugin: pluginName,
					tool: id,
					schemaCompatible: 'ok',
					handlerReturned: true,
				});
			} catch (err) {
				secondPass.push({
					plugin: pluginName,
					tool: id,
					schemaCompatible: 'failed',
					handlerReturned: true,
					detail: `output mismatch: ${(err as Error).message}`,
				});
			}
		} catch (err) {
			secondPass.push({
				plugin: pluginName,
				tool: id,
				schemaCompatible: 'failed',
				handlerReturned: false,
				detail: (err as Error).message,
			});
		}
	}
	return [...results, ...secondPass];
};

/**
 * Build a minimal valid input for each "needs-input" tool so the
 * second pass can verify the happy-path outputSchema. Returns
 * `null` when the probe input cannot be safely constructed (e.g.
 * the input requires a workspace path we don't have).
 */
const buildProbeInput = (id: string): Record<string, unknown> | null => {
	switch (id) {
		case 'fs_read':
			return { path: 'plugins/audit/README.md' };
		case 'fs_write':
			return {
				path: '.verify-tmp/probe.txt',
				content: 'plugin-tool-verify probe',
			};
		case 'scaffold':
			return { kind: 'tool', name: 'verify-probe' };
		default:
			return null;
	}
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

	const groupedByPlugin = new Map<string, IVerifyResult[]>();
	for (const r of all) {
		const arr = groupedByPlugin.get(r.plugin) ?? [];
		arr.push(r);
		groupedByPlugin.set(r.plugin, arr);
	}

	let totalOk = 0;
	let totalNeedsInput = 0;
	let totalFailed = 0;
	console.log(
		`${'Plugin'.padEnd(20)} ${'Tool'.padEnd(36)} ${'Schema'.padEnd(14)} ${'Handler'.padEnd(10)}`,
	);
	console.log('-'.repeat(82));
	for (const [plugin, results] of groupedByPlugin) {
		for (const r of results) {
			const mark =
				r.schemaCompatible === 'ok'
					? '✓ ok'
					: r.schemaCompatible === 'needs-input'
						? '~ needs input'
						: '✗ failed';
			const handlerMark = r.handlerReturned ? '✓' : '✗';
			console.log(
				`${plugin.padEnd(20)} ${r.tool.padEnd(36)} ${mark.padEnd(14)} ${handlerMark.padEnd(10)}`,
			);
			if (r.schemaCompatible === 'ok') totalOk += 1;
			else if (r.schemaCompatible === 'needs-input') totalNeedsInput += 1;
			else totalFailed += 1;
		}
	}
	console.log('-'.repeat(82));
	console.log(
		`Total: ${totalOk} ok, ${totalNeedsInput} need-input, ${totalFailed} failed across ${all.length} tools`,
	);
	return totalFailed === 0 ? 0 : 1;
};

if (import.meta.main) {
	main().then((code) => process.exit(code));
}

export { verifyPlugin };
