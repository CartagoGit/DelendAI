/**
 * router-enforcement.spec.ts — f00189 (Track F / security).
 *
 * `enforceDryRunReturnContract` (dry-run/enforce.ts) used to have ZERO
 * production call sites — it was wired only into its own definition,
 * the public barrel, and unit specs that call the helper directly.
 * `dryRun: true` was, in practice, an argument a plugin could ignore
 * with nothing in the runtime checking anything.
 *
 * These tests exercise the ACTUAL dispatch path
 * (`ToolSurfaceRuntime.invokeTool`, in
 * `packages/core/src/lib/project/tool-surface-runtime.service.ts`)
 * rather than calling `enforceDryRunReturnContract` in isolation, so a
 * regression that un-wires the enforcement (e.g. someone bypasses
 * `invokeTool` or strips the call out of it again) fails a test that
 * actually routes a call, not just a helper-level unit test.
 *
 * Enforcement level: DETECTION, not prevention. The handler below has
 * already run — and could already have performed a real side effect —
 * by the time its return value is checked. Making the effect itself
 * impossible while `dryRun` is true requires a handler to construct
 * its mutating capabilities through `dry-run/effect-guard.ts`'s
 * `guardEffectCapability` / `runWithDryRunGate`; `IMcpPluginContext`
 * does not currently hand out any capability object for the runtime
 * to gate on the plugin's behalf, so that stronger property is not
 * wired here.
 */

import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@mcp-vertex/core/lib/project/tool-surface-runtime.service';

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const buildRuntimeWithHandler = (
	handler: (args: unknown, extra: unknown) => Promise<unknown>,
) => {
	const runtime = createToolSurfaceRuntime({
		mode: 'native',
		bootstrapToolIds: ['overview'],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'writer_run',
				name: 'mcp-vertex_writer_run',
				toolId: 'run',
				pluginId: 'writer',
				namespace: 'writer',
			},
		],
		plugins: [
			{
				id: 'writer',
				namespace: 'writer',
				toolRegistrationIds: ['writer_run'],
			},
		],
	});
	runtime.bindRegisteredTool({
		registrationId: 'writer_run',
		name: 'mcp-vertex_writer_run',
		handler,
		handle: makeHandle(),
	});
	runtime.finalizeInitialSurface();
	return runtime;
};

describe('f00189 — dry-run enforcement wired into invokeTool (router-level)', () => {
	it('refuses a handler that ignored args.dryRun and performed the real effect anyway', async () => {
		let reallyRan = false;
		const runtime = buildRuntimeWithHandler(async () => {
			// Simulates a plugin that never reads args.dryRun: it always
			// does the real work and returns a normal success payload.
			reallyRan = true;
			return { ok: true, committed: true, hash: 'abc123' };
		});

		const result = (await runtime.invokeTool(
			'mcp-vertex_writer_run',
			{ dryRun: true },
			{},
		)) as { isError?: boolean; content: Array<{ text: string }> };

		// The handler already ran — this is detection, not prevention —
		// but the caller must never receive the bogus "dry run" payload.
		expect(reallyRan).toBe(true);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(
			'violated the dryRun contract',
		);
		expect(result.content[0]?.text).toContain('ignored args.dryRun');
	});

	it('refuses a handler that returned a structurally malformed DryRunResult', async () => {
		const runtime = buildRuntimeWithHandler(async () => ({
			dryRun: true,
			wouldChange: [{ kind: 'unknown', path: '/a', summary: 's' }],
			wouldRun: [],
			risk: 'catastrophic',
		}));

		const result = (await runtime.invokeTool(
			'mcp-vertex_writer_run',
			{ dryRun: true },
			{},
		)) as { isError?: boolean; content: Array<{ text: string }> };

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('malformed DryRunResult');
	});

	it('forwards a well-formed IDryRunResult when the handler honours dryRun', async () => {
		const plan = {
			dryRun: true as const,
			wouldChange: [
				{ kind: 'write' as const, path: '/a', summary: 'edit a' },
			],
			wouldRun: [],
			risk: 'low' as const,
		};
		const runtime = buildRuntimeWithHandler(async () => plan);

		const result = await runtime.invokeTool(
			'mcp-vertex_writer_run',
			{ dryRun: true },
			{},
		);

		expect(result).toEqual(plan);
	});

	it('does not touch the result when the caller did not ask for a dryRun', async () => {
		const runtime = buildRuntimeWithHandler(async () => ({
			ok: true,
			committed: true,
		}));

		const result = await runtime.invokeTool(
			'mcp-vertex_writer_run',
			{},
			{},
		);

		expect(result).toEqual({ ok: true, committed: true });
	});
});
