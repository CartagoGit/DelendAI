import { describe, expect, it } from 'vitest';

import { buildAutoRunRegistration } from '../../../../src/lib/tools/auto-run.tool';
import type { IDiscoveryDeps } from '../../../../src/lib/contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from '../../../../src/lib/discovery/roster-store';

type Handler = (args: {
	costCeiling?: number;
	maxDepth?: number;
	costQualityTradeoff?: number;
	pin?: string;
	install?: boolean;
	installProviderId?: string;
}) => Promise<{ structuredContent?: Record<string, unknown> }>;

const capture = async (
	deps: IDiscoveryDeps,
	rosterStore?: IRosterSnapshotStore,
	installRunner?: (argv: readonly [string, ...string[]]) => Promise<{
		code: number;
		stdout: string;
		stderr: string;
		timedOut: boolean;
	}>,
): Promise<Handler> => {
	let handler: Handler | undefined;
	const server = {
		registerTool(name: string, _c: unknown, fn: Handler): void {
			if (name.endsWith('_auto_run')) handler = fn;
		},
	};
	const reg = buildAutoRunRegistration({
		namespacePrefix: 'mcp',
		defaultTradeoff: 10, // cheap-leaning so the ladder climbs up
		deps,
		...(rosterStore !== undefined ? { rosterStore } : {}),
		...(installRunner !== undefined ? { installRunner } : {}),
	});
	await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
	if (!handler) throw new Error('auto_run did not register');
	return handler;
};

// groq (tier 1) + claude CLI (tier 4).
const deps: IDiscoveryDeps = {
	commandExists: async (c) => c === 'claude',
	env: { GROQ_API_KEY: 'g' },
};

describe('auto_run tool', () => {
	it('returns an escalation ladder starting cheap and climbing, with execute guidance', async () => {
		const handler = await capture(deps);
		const res = await handler({});
		const body = res.structuredContent as {
			ladder: { step: number; id: string; costTier: number }[];
			howToExecute: string;
			costCeiling: number;
		};
		expect(body.ladder.map((r) => r.id)).toEqual([
			'groq-api',
			'claude-cli',
		]);
		expect(body.ladder[0]?.step).toBe(1);
		expect(body.howToExecute).toContain('acceptance gate');
	});

	it('honours a cost ceiling — never plans a rung above it', async () => {
		const handler = await capture(deps);
		const res = await handler({ costCeiling: 2 });
		const body = res.structuredContent as {
			ladder: { id: string; costTier: number }[];
		};
		expect(body.ladder.map((r) => r.id)).toEqual(['groq-api']);
		expect(body.ladder.every((r) => r.costTier <= 2)).toBe(true);
	});

	it('persists discovery before planning a route', async () => {
		let saves = 0;
		const handler = await capture(deps, {
			save: async () => {
				saves += 1;
			},
		});
		await handler({});
		expect(saves).toBe(1);
	});

	it('returns a trusted install hint when no provider is reachable', async () => {
		const handler = await capture({
			commandExists: async () => false,
			env: {},
		});
		const body = (await handler({})).structuredContent as {
			nextInstall: { id: string; hint: string } | null;
		};
		expect(body.nextInstall).toEqual(
			expect.objectContaining({
				id: 'claude-cli',
				hint: 'npm install -g @anthropic-ai/claude-code',
			}),
		);
	});

	it('runs only the catalogue argv after explicit install consent', async () => {
		const received: Array<readonly [string, ...string[]]> = [];
		const handler = await capture(
			{ commandExists: async () => false, env: {} },
			undefined,
			async (argv) => {
				received.push(argv);
				return { code: 0, stdout: '', stderr: '', timedOut: false };
			},
		);
		const body = (
			await handler({
				install: true,
				installProviderId: 'codex-cli',
			})
		).structuredContent as {
			installation: {
				attempted: boolean;
				ok: boolean;
				providerId: string;
			} | null;
		};
		expect(received).toEqual([['npm', 'install', '-g', '@openai/codex']]);
		expect(body.installation).toEqual(
			expect.objectContaining({
				attempted: true,
				ok: true,
				providerId: 'codex-cli',
			}),
		);
	});
});
