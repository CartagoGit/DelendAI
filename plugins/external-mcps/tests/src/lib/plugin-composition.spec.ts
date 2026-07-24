/**
 * plugin-composition.spec.ts — the ack ↔ call composition (x00097 S1).
 *
 * Audit a00052 #12: the `ack` tool and the `call` proxy were built from
 * the same manifest but did NOT share the pending-acks ledger, so an
 * accepted human ack never enabled the call — the proxy's fail-closed
 * default refused everything. These tests exercise the REAL plugin
 * `register()` (no hand-wired registrations): record a decision through
 * the registered `ack` tool, observe the registered `call` tool honour it
 * on the next invocation, durably, with the default autonomy knobs.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import plugin from '../../../src/index';

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<IToolResult>;

/** Register every plugin tool against a capturing stub server. */
const registerAll = async (
	regs: readonly IToolRegistration[],
): Promise<Map<string, ToolHandler>> => {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool: (
			name: string,
			_config: unknown,
			handler: ToolHandler,
		) => {
			handlers.set(name, handler);
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	for (const reg of regs) await reg.register(server);
	return handlers;
};

const payload = (result: IToolResult): Record<string, unknown> =>
	result.structuredContent ??
	(JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>);

describe('external-mcps ack ↔ call composition (x00097 S1)', () => {
	let workspaceRoot: string;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'ext-mcps-compose-'));
	});

	afterEach(() => {
		rmSync(workspaceRoot, { recursive: true, force: true });
	});

	const assemblePlugin = async (options: Record<string, unknown>) => {
		const ctx = {
			options,
			args: {},
			namespacePrefix: 'external-mcps',
			pluginCacheDir: 'external-mcps',
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			workspace: {
				root: workspaceRoot,
				resolve: (rel: string) => join(workspaceRoot, rel),
			},
		} as unknown as Parameters<typeof plugin.register>[0];
		const regs = await plugin.register(ctx);
		return registerAll(regs.tools ?? []);
	};

	// A declared server whose command can never spawn: once the ack gate
	// opens, the call must progress PAST it into the registry (call-failed),
	// proving the refusal was the gate and not the missing child.
	const demoServers = {
		servers: {
			demo: {
				version: '1.0.0',
				command: 'mcp-vertex-test-binary-that-does-not-exist',
				args: [],
			},
		},
	};

	it('refuses the call fail-closed while no human ack is recorded (default knobs)', async () => {
		const tools = await assemblePlugin(demoServers);
		const result = await tools.get('external-mcps_call')!({
			server: 'demo',
			tool: 'ping',
		});
		expect(payload(result)).toMatchObject({
			ok: false,
			code: 'ack-required',
		});
	});

	it('an ack accepted through the registered ack tool enables the registered call', async () => {
		const tools = await assemblePlugin(demoServers);
		const call = tools.get('external-mcps_call')!;
		const ack = tools.get('external-mcps_ack')!;

		expect(
			payload(await call({ server: 'demo', tool: 'ping' })),
		).toMatchObject({ ok: false, code: 'ack-required' });

		const decision = payload(
			await ack({ server: 'demo', accept: true, ackedBy: 'spec-human' }),
		);
		expect(decision).toMatchObject({ ok: true, mode: 'record' });

		// Same session, no re-registration: the gate reads the ledger fresh.
		const after = payload(await call({ server: 'demo', tool: 'ping' }));
		expect(after.ok).toBe(false);
		expect(after.code).toBe('call-failed'); // past the gate, into the spawn
	});

	it('a recorded rejection keeps the gate closed', async () => {
		const tools = await assemblePlugin(demoServers);
		const decision = payload(
			await tools.get('external-mcps_ack')!({
				server: 'demo',
				accept: false,
			}),
		);
		expect(decision).toMatchObject({ ok: true, mode: 'record' });
		const result = payload(
			await tools.get('external-mcps_call')!({
				server: 'demo',
				tool: 'ping',
			}),
		);
		expect(result).toMatchObject({ ok: false, code: 'ack-required' });
	});

	it('the ack survives re-registration (durable ledger, not in-memory state)', async () => {
		const first = await assemblePlugin(demoServers);
		await first.get('external-mcps_ack')!({ server: 'demo', accept: true });

		const second = await assemblePlugin(demoServers);
		const result = payload(
			await second.get('external-mcps_call')!({
				server: 'demo',
				tool: 'ping',
			}),
		);
		expect(result.code).toBe('call-failed');
	});

	it('consumes the autonomy knob: requireHumanAckWhenLlmDecides=false skips the gate', async () => {
		const tools = await assemblePlugin({
			...demoServers,
			requireHumanAckWhenLlmDecides: false,
		});
		const result = payload(
			await tools.get('external-mcps_call')!({
				server: 'demo',
				tool: 'ping',
			}),
		);
		expect(result.code).toBe('call-failed'); // no ack demanded
	});
});
