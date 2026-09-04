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
 * by the time its return value is checked. Since 8f05b5d2 / r00037,
 * `IMcpPluginContext.effects` DOES hand plugins a guarded capability
 * (`git`, via the `EffectBroker` — `capabilities/effect-broker.ts`)
 * that closes this gap for plugins that use it; see
 * `capability-injection.spec.ts` (sibling file) and
 * `capabilities/effect-broker.spec.ts` for the PREVENTION-level
 * property. This file's handler intentionally does NOT use
 * `ctx.effects` — it models a plugin that still reaches for its own
 * unguarded mutation (or hasn't migrated yet), which is exactly the
 * case S1's violation log (`dry-run-violation-log.ts`) exists to make
 * visible rather than silent.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import {
	clearDryRunViolationsForTests,
	enforceDryRunReturnContract,
	listDryRunViolations,
	planDryRun,
} from '@delendai/core/public';

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
	beforeEach(() => {
		clearDryRunViolationsForTests();
	});

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

	it('r00037 S1 — records the violation with the responsible plugin and tool, so it is nameable rather than silent', async () => {
		const runtime = buildRuntimeWithHandler(async () => ({
			ok: true,
			committed: true,
		}));

		await runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {});

		const violations = listDryRunViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			tool: 'mcp-vertex_writer_run',
			pluginId: 'writer',
			reason: 'handler ignored args.dryRun and returned a non-dryRun payload',
		});
	});

	it('r00037 S1 — does not record a violation when the handler honours the dryRun contract', async () => {
		const plan = {
			dryRun: true as const,
			wouldChange: [],
			wouldRun: [],
			risk: 'low' as const,
		};
		const runtime = buildRuntimeWithHandler(async () => plan);

		await runtime.invokeTool('mcp-vertex_writer_run', { dryRun: true }, {});

		expect(listDryRunViolations()).toEqual([]);
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

describe('MCP envelopes (the shape every real handler returns)', () => {
	it('accepts a plan nested in structuredContent', () => {
		// `toolOk`/`toolJson` wrap the payload as
		// `{ content, structuredContent }`, so checking the envelope itself
		// for `dryRun === true` refused EVERY well-behaved tool: a handler
		// could honour the contract perfectly and still be reported as
		// having "ignored args.dryRun".
		const envelope = {
			content: [{ type: 'text', text: '{}' }],
			structuredContent: planDryRun({ risk: 'low', note: 'preview' }),
		};
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: envelope,
		});
		expect(verdict.kind).toBe('forwarded');
	});

	it('still refuses an envelope whose payload is not a dry-run plan', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: {
				content: [{ type: 'text', text: '{}' }],
				structuredContent: { ok: true, closable: true },
			},
		});
		expect(verdict.kind).toBe('dry-run-contract-violation');
	});

	it('still accepts a bare plan with no envelope', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: planDryRun({ risk: 'low' }),
		});
		expect(verdict.kind).toBe('forwarded');
	});
});
