/**
 * f00131 S2.b — `release_plan` tool tests.
 *
 * Coverage:
 * - empty publish-order → `publish-order-missing` envelope.
 * - fix-only commit range → bump=patch; all packages bumped to the new patch.
 * - feat commit → bump=minor; first package is bumped minor.
 * - breaking commit → bump=major; first package is bumped major.
 * - no commits / docs-only → bump=none; version stays the same.
 * - per-package transition matches the same target (lockstep bump).
 */
import { describe, expect, it } from 'vitest';

import {
	buildReleasePlan,
	buildReleasePlanToolRegistration,
	type IPublishOrderEntry,
} from './release-plan.tool';

// SAMPLE uses the real monorepo anchor (`packages/core` at 0.1.0) plus
// a plugin (`plugins/changelog`) pinned at 0.0.1 — the lockstep plan must
// still move the plugin to the anchor's bumped target, never compute
// its bump independently.
const SAMPLE_PUBLISH_ORDER: readonly IPublishOrderEntry[] = [
	{ dir: 'packages/core', name: '@delendai/core', version: '0.1.0' },
	{ dir: 'packages/cli', name: '@delendai/cli', version: '0.1.0' },
	{
		dir: 'plugins/changelog',
		name: '@delendai/changelog',
		version: '0.0.1',
	},
];

const fakeServer = () => {
	const tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> =
		{};
	return {
		tools,
		registerTool(
			name: string,
			_meta: unknown,
			handler: (a: unknown) => Promise<unknown>,
		) {
			tools[name] = { handler };
			return { dispose: () => undefined } as never;
		},
	};
};

const mountHandler = async (publishOrder: readonly IPublishOrderEntry[]) => {
	const registration = buildReleasePlanToolRegistration({
		namespacePrefix: 'changelog',
		publishOrder,
	});
	const server = fakeServer();
	await registration.register(server as never);
	const tool = server.tools.changelog_release_plan;
	if (tool === undefined) throw new Error('release_plan tool not registered');
	return tool.handler;
};

const callHandler = async (
	handler: (a: unknown) => Promise<unknown>,
	args: unknown,
) => {
	const res = (await handler(args)) as {
		content: Array<{ text: string }>;
	};
	return JSON.parse(res.content[0]?.text ?? '{}') as Record<string, unknown>;
};

const commit = (overrides: Record<string, unknown>) => ({
	type: 'chore',
	subject: 'noop',
	body: undefined,
	breaking: false,
	hash: 'deadbee',
	...overrides,
});

describe('f00131 S2.b release-plan', () => {
	describe('buildReleasePlan (pure)', () => {
		const inferredPatch = {
			kind: 'patch' as const,
			reason: 'fix commit',
			considered: 1,
		};
		const inferredMinor = {
			kind: 'minor' as const,
			reason: 'feat commit',
			considered: 1,
		};
		const inferredNone = {
			kind: 'none' as const,
			reason: 'no commits',
			considered: 0,
		};

		it('walks every entry and bumps the version to match the bump kind', () => {
			const out = buildReleasePlan(SAMPLE_PUBLISH_ORDER, inferredPatch);
			expect(out).toHaveLength(3);
			// Lockstep: the anchor (core) is bumped; every entry — including
			// the 0.0.1 plugin — inherits the anchor's target (0.1.1),
			// never computes its own bump independently.
			expect(out.map((e) => `${e.name}:${e.from}->${e.to}`)).toEqual([
				'@delendai/core:0.1.0->0.1.1',
				'@delendai/cli:0.1.0->0.1.1',
				'@delendai/changelog:0.0.1->0.1.1',
			]);
		});

		it('minor bump resets patch', () => {
			const out = buildReleasePlan(SAMPLE_PUBLISH_ORDER, inferredMinor);
			expect(out.map((e) => e.to)).toEqual(['0.2.0', '0.2.0', '0.2.0']);
		});

		it('none leaves the version unchanged', () => {
			const out = buildReleasePlan(SAMPLE_PUBLISH_ORDER, inferredNone);
			// `from` keeps each entry's real current version; `to` is the
			// anchor's unchanged version (lockstep, not per-entry).
			expect(out.map((e) => e.from)).toEqual(['0.1.0', '0.1.0', '0.0.1']);
			expect(out.map((e) => e.to)).toEqual(['0.1.0', '0.1.0', '0.1.0']);
		});

		it('returns an empty plan when no packages are published', () => {
			expect(
				buildReleasePlan([], inferredPatch).map(
					(e) => `${e.from}->${e.to}`,
				),
			).toEqual([]);
		});
	});

	describe('release_plan tool', () => {
		it('returns publish-order-missing when the order is empty', async () => {
			const handler = await mountHandler([]);
			const body = await callHandler(handler, {});
			expect(body.ok).toBe(false);
			const err = body.error as { reason: string };
			expect(err.reason).toBe('publish-order-missing');
		});

		it('infers patch from a single fix commit', async () => {
			const handler = await mountHandler(SAMPLE_PUBLISH_ORDER);
			const body = await callHandler(handler, {
				commits: [
					commit({
						type: 'fix',
						hash: 'abc1234',
						subject: 'crash on boot',
					}),
				],
			});
			expect(body.ok).toBe(true);
			expect(body.bump).toBe('patch');
			expect(body.from).toBe('0.1.0');
			expect(body.to).toBe('0.1.1');
			const entries = body.entries as Array<{ to: string }>;
			expect(entries.every((e) => e.to === '0.1.1')).toBe(true);
		});

		it('infers minor from a feat commit', async () => {
			const handler = await mountHandler(SAMPLE_PUBLISH_ORDER);
			const body = await callHandler(handler, {
				commits: [
					commit({
						type: 'feat',
						hash: 'feed567',
						subject: 'release_plan tool',
					}),
				],
			});
			expect(body.bump).toBe('minor');
			expect(body.to).toBe('0.2.0');
		});

		it('infers major from a breaking commit', async () => {
			const handler = await mountHandler(SAMPLE_PUBLISH_ORDER);
			const body = await callHandler(handler, {
				commits: [
					commit({
						type: 'feat',
						subject: 'redesign public API',
						breaking: true,
						hash: '1112223',
					}),
				],
			});
			expect(body.bump).toBe('major');
			expect(body.to).toBe('1.0.0');
		});

		it('returns none for an empty commits list', async () => {
			const handler = await mountHandler(SAMPLE_PUBLISH_ORDER);
			const body = await callHandler(handler, { commits: [] });
			expect(body.bump).toBe('none');
			// The handler's top-level `from`/`to` shadow the anchor (core),
			// not the first plugin. With `kind: none` the anchor stays put.
			expect(body.from).toBe('0.1.0');
			expect(body.to).toBe('0.1.0');
			const entries = body.entries as Array<{
				from: string;
				to: string;
			}>;
			// Lockstep: every entry — including the 0.0.1 plugin — lands on
			// the anchor's unchanged version (0.1.0).
			expect(entries.every((e) => e.to === '0.1.0')).toBe(true);
		});
	});
});
