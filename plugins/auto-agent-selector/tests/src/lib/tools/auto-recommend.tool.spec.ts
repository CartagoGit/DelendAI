import { describe, expect, it } from 'vitest';

import { buildAutoRecommendRegistration } from '../../../../src/lib/tools/auto-recommend.tool';
import type { IDiscoveryDeps } from '../../../../src/lib/contracts/interfaces/roster.interface';

type Handler = (args: {
	costQualityTradeoff?: number;
	pin?: string;
	taskType?: string;
}) => Promise<{ structuredContent?: Record<string, unknown> }>;

const capture = async (
	deps: IDiscoveryDeps,
	defaultTradeoff = 7,
	taskPins?: Readonly<Record<string, string>>,
): Promise<Handler> => {
	let handler: Handler | undefined;
	const server = {
		registerTool(name: string, _c: unknown, fn: Handler): void {
			if (name.endsWith('_auto_recommend')) handler = fn;
		},
	};
	const reg = buildAutoRecommendRegistration({
		namespacePrefix: 'mcp',
		defaultTradeoff,
		deps,
		...(taskPins !== undefined ? { taskPins } : {}),
	});
	await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
	if (!handler) throw new Error('auto_recommend did not register');
	return handler;
};

// A roster with a cheap Groq (tier 1) and an expensive Claude CLI (tier 4).
const deps: IDiscoveryDeps = {
	commandExists: async (c) => c === 'claude',
	env: { GROQ_API_KEY: 'g' },
};

describe('auto_recommend tool', () => {
	it('recommends the cheapest at a cheap-leaning dial, with rationale', async () => {
		const handler = await capture(deps);
		const res = await handler({ costQualityTradeoff: 10 });
		const body = res.structuredContent as {
			recommended: { id: string; rationale: string } | null;
			ranked: unknown[];
			costQualityTradeoff: number;
		};
		expect(body.recommended?.id).toBe('groq-api');
		expect(body.recommended?.rationale.length).toBeGreaterThan(0);
		expect(body.costQualityTradeoff).toBe(10);
		expect(body.ranked).toHaveLength(2);
	});

	it('recommends the strongest at dial 0', async () => {
		const handler = await capture(deps);
		const res = await handler({ costQualityTradeoff: 0 });
		const body = res.structuredContent as {
			recommended: { id: string } | null;
		};
		expect(body.recommended?.id).toBe('claude-cli');
	});

	it('honours a reachable pin over the dial', async () => {
		const handler = await capture(deps);
		const res = await handler({
			costQualityTradeoff: 10,
			pin: 'claude-cli',
		});
		const body = res.structuredContent as {
			recommended: { id: string } | null;
			pinned: string | null;
		};
		expect(body.recommended?.id).toBe('claude-cli');
		expect(body.pinned).toBe('claude-cli');
	});

	it('honours a configured pin for a task type', async () => {
		const handler = await capture(deps, 10, { review: 'claude-cli' });
		const body = (await handler({ taskType: 'review' }))
			.structuredContent as {
			recommended: { id: string } | null;
		};
		expect(body.recommended?.id).toBe('claude-cli');
	});

	it('falls back to the configured default dial when none is passed', async () => {
		const handler = await capture(deps, 0); // configured "always strongest"
		const res = await handler({});
		const body = res.structuredContent as {
			recommended: { id: string } | null;
			costQualityTradeoff: number;
		};
		expect(body.costQualityTradeoff).toBe(0);
		expect(body.recommended?.id).toBe('claude-cli');
	});

	it('returns a null recommendation when nothing is reachable', async () => {
		const handler = await capture({
			commandExists: async () => false,
			env: {},
		});
		const res = await handler({});
		const body = res.structuredContent as {
			recommended: unknown;
			ranked: unknown[];
		};
		expect(body.recommended).toBeNull();
		expect(body.ranked).toEqual([]);
	});
});
