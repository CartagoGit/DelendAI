import { describe, expect, it } from 'vitest';

import { buildAutoRunRegistration } from '../../../../src/lib/tools/auto-run.tool';
import type { IDiscoveryDeps } from '../../../../src/lib/contracts/interfaces/roster.interface';

type Handler = (args: {
	costCeiling?: number;
	maxDepth?: number;
	costQualityTradeoff?: number;
	pin?: string;
}) => Promise<{ structuredContent?: Record<string, unknown> }>;

const capture = async (deps: IDiscoveryDeps): Promise<Handler> => {
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
});
