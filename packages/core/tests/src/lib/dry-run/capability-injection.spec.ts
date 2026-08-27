/**
 * capability-injection.spec.ts — capability-injection layer.
 *
 * `router-enforcement.spec.ts` (sibling file) proves DETECTION:
 * `invokeTool` catches a handler that ignored `args.dryRun` only AFTER
 * it already ran, by inspecting the return value. This file proves the
 * stronger property that closes that gap: `invokeTool` now opens an
 * AMBIENT dry-run scope (`dry-run/dry-run-scope.helper.ts`) around the
 * handler call, so a capability built ONCE at plugin register time
 * (before any tool call, closed over by the handler forever) still
 * refuses its real effect on a per-call basis — even when the handler
 * itself never reads `args.dryRun` and unconditionally calls the
 * capability.
 *
 * This models the actual shape of the codebase: `IMcpPluginContext` is
 * built once per plugin at boot (`register(ctx)`), so a capability
 * like `ctx.effects.git` cannot be "constructed fresh" from `args` the
 * way a hand-rolled per-call factory could. The capability instead
 * re-reads the ambient flag on every invocation
 * (`effect-capability-factory.helper.ts`), which is what the router
 * seeds before calling the handler.
 */

import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@mcp-vertex/core/lib/project/tool-surface-runtime.service';
import {
	DryRunEffectRefusedError,
	guardEffectCapability,
} from '@mcp-vertex/core/lib/dry-run/effect-guard.helper';
import { getActiveDryRunFlag } from '@mcp-vertex/core/lib/dry-run/dry-run-scope.helper';

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

/**
 * Builds ONE runtime + ONE handler closure, mirroring how a real
 * plugin's `register(ctx)` runs once and every later `invokeTool` call
 * reuses the SAME handler and the SAME capability inside it. The
 * capability re-reads `getActiveDryRunFlag()` on every call rather than
 * capturing a `dryRun` value at construction — that is the whole point
 * of the ambient-scope design.
 */
const buildRuntimeWithInjectedCapability = () => {
	const calls: string[] = [];
	const realEffect = (label: string): void => {
		calls.push(label);
	};
	// Built ONCE, outside of and before any tool call — exactly like a
	// plugin's `ctx.effects.git` closed over inside its handler.
	const capability = (label: string): void => {
		guardEffectCapability({
			capability: 'write',
			dryRun: getActiveDryRunFlag(),
			perform: realEffect,
		})(label);
	};

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
		// This handler NEVER reads `args.dryRun` — it always calls the
		// capability unconditionally, exactly like an unmigrated plugin
		// handler that "forgot" the dry-run contract.
		handler: async () => {
			capability('mutated');
			return { ok: true, committed: true };
		},
		handle: makeHandle(),
	});
	runtime.finalizeInitialSurface();
	return { runtime, calls };
};

describe('capability-injection layer — ambient dry-run scope wired into invokeTool', () => {
	it('prevents the effect: a handler that ignores args.dryRun still cannot reach it while dryRun is true', async () => {
		const { runtime, calls } = buildRuntimeWithInjectedCapability();

		// The handler's own uncaught throw (`DryRunEffectRefusedError`)
		// propagates out of `invokeTool` like any other handler failure —
		// the MCP SDK / router boundary (not this unit) is what turns an
		// uncaught throw into an `isError` tool result, so this test
		// asserts the throw directly.
		await expect(
			runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);

		// The capability call never reached `realEffect` — this is
		// PREVENTION, not detection: the mutation never happened, so
		// there is nothing to catch after the fact.
		expect(calls).toEqual([]);
	});

	it('performs the real effect when dryRun is not set', async () => {
		const { runtime, calls } = buildRuntimeWithInjectedCapability();

		const result = (await runtime.invokeTool(
			'mcp-vertex_writer_run',
			{},
			{},
		)) as { isError?: boolean };

		expect(calls).toEqual(['mutated']);
		expect(result.isError).toBeUndefined();
	});

	it('gates each call independently even though the capability closure is reused across calls', async () => {
		const { runtime, calls } = buildRuntimeWithInjectedCapability();

		await expect(
			runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);
		await runtime.invokeTool('mcp-vertex_writer_run', {}, {});
		await expect(
			runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);

		// Only the middle (real) call reached the effect — proving the
		// SAME long-lived capability instance is re-gated per call, not
		// locked into whatever `dryRun` value was active the first time
		// it ran.
		expect(calls).toEqual(['mutated']);
	});

	it('the guarded capability throws the typed refusal error directly', async () => {
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
		let caught: unknown;
		runtime.bindRegisteredTool({
			registrationId: 'writer_run',
			name: 'mcp-vertex_writer_run',
			handler: async () => {
				try {
					guardEffectCapability({
						capability: 'write',
						dryRun: getActiveDryRunFlag(),
						perform: () => 'real result',
					})();
					return { ok: true };
				} catch (error) {
					caught = error;
					throw error;
				}
			},
			handle: makeHandle(),
		});
		runtime.finalizeInitialSurface();

		await expect(
			runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);

		expect(caught).toBeInstanceOf(DryRunEffectRefusedError);
	});
});
