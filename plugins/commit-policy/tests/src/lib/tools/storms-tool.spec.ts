import { describe, expect, it, vi } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import { withOkEnvelope } from '@delendai/core/plugin';

import { STORMS_OUTPUT_SCHEMA } from '@delendai/commit-policy/lib/contracts/constants/storms-tool.constant';
import type { StormDetector } from '@delendai/commit-policy/lib/services/storm-detector';

import {
	buildStormsToolRegistration,
	runCommitPolicyStorms,
} from '@delendai/commit-policy/lib/tools/storms-tool';

describe('commit_policy_storms', () => {
	it('returns a toolOk payload with inferred suggestedFix and RFC3339 timestamps', async () => {
		const now = Date.now();

		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			observedEvents: [
				{
					timestamp: now,
					code: 'WORKSPACE_HAS_NO_FILES',
					trigger: 'slice',
					proposalId: 'x00419',
				},
			],
		});

		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			storms: Array<{
				code: string;
				trigger: string;
				count: number;
				windowSeconds: number;
				sampleProposalIds: string[];
				firstSeenAt: string;
				windowStartedAt: string;
				lastSeenAt: string;
				suggestedFix?: string;
				exceedsThreshold: boolean;
			}>;
			totalEventsInWindow: number;
			windowSeconds: number;
			threshold: number;
		};

		expect(body).toEqual({
			ok: true,
			storms: [
				{
					code: 'WORKSPACE_HAS_NO_FILES',
					trigger: 'slice',
					count: 1,
					windowSeconds: 30,
					sampleProposalIds: ['x00419'],
					firstSeenAt: new Date(now).toISOString(),
					windowStartedAt: new Date(now).toISOString(),
					lastSeenAt: new Date(now).toISOString(),
					suggestedFix:
						'resolve-scope.ts: files is empty after the stage step. Check whether the resolver is filtering by workspaceDirty.',
					exceedsThreshold: false,
				},
			],
			totalEventsInWindow: 1,
			windowSeconds: 30,
			threshold: 5,
		});
		expect(result.content).toEqual([
			{ type: 'text', text: JSON.stringify(body) },
		]);
	});

	it('returns an empty success snapshot and does not invoke onSnapshot', async () => {
		const onSnapshot = vi.fn();

		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			onSnapshot,
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual({
			ok: true,
			storms: [],
			totalEventsInWindow: 0,
			windowSeconds: 30,
			threshold: 5,
		});
		expect(onSnapshot).not.toHaveBeenCalled();
	});

	/**
	 * The declared outputSchema must accept what the handler actually
	 * sends. `toolOk` puts `{ ok: true, ... }` on the wire, and a client
	 * that listed tools validates structuredContent against the advertised
	 * JSON Schema, which forbids undeclared keys — so a schema without
	 * `ok` made this tool reject its own successful answer.
	 *
	 * `.strict()` is what reproduces that: plain Zod strips unknown keys
	 * and would pass no matter what the schema declared. The tool's own
	 * internal `safeParse` of the pre-envelope payload agreed with the
	 * schema and still missed it, for the same reason.
	 */
	it('declares an output schema that accepts its own success envelope', async () => {
		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
		});

		expect(
			withOkEnvelope(STORMS_OUTPUT_SCHEMA)
				.strict()
				.parse(result.structuredContent),
		).toMatchObject({ ok: true, storms: [] });
	});

	type Handler = (args: unknown) => Promise<{
		readonly isError?: boolean;
		readonly structuredContent?: unknown;
	}>;

	/** The registration path: nothing exercised it, so it went unmeasured. */
	it('registers the tool and answers through the registered handler', async () => {
		let name: string | undefined;
		let handler: Handler | undefined;
		const server = createFakeToolServer({
			onRegisterTool: (tool) => {
				name = tool.name;
				handler = tool.handler as Handler;
			},
		});

		await buildStormsToolRegistration({
			namespacePrefix: 'delendai',
		}).register(server);

		expect(name).toBe('delendai_commit_policy_storms');
		const result = await handler!({});
		expect(
			withOkEnvelope(STORMS_OUTPUT_SCHEMA)
				.strict()
				.parse(result.structuredContent),
		).toMatchObject({ ok: true });
	});

	it('keeps a suggestedFix the producer already supplied', async () => {
		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			observedEvents: [
				{
					timestamp: Date.now(),
					code: 'WORKSPACE_HAS_NO_FILES',
					trigger: 'slice',
					proposalId: 'x00419',
					suggestedFix: 'the producer already knew',
				},
			],
		});
		const body = result.structuredContent as {
			storms: Array<{ suggestedFix?: string }>;
		};
		expect(body.storms[0]?.suggestedFix).toBe('the producer already knew');
	});

	it('reports a detector failure as a tool error rather than throwing', async () => {
		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			observedEvents: [
				{
					timestamp: Date.now(),
					code: 'BOOM',
					trigger: 'slice',
					proposalId: 'x1',
				},
			],
			detector: fakePartial<StormDetector>({
				observe: () => {
					throw new Error('detector exploded');
				},
			}),
		});
		expect(result.isError).toBe(true);
	});

	it('survives a thrown non-Error', async () => {
		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			observedEvents: [
				{
					timestamp: Date.now(),
					code: 'BOOM',
					trigger: 'slice',
					proposalId: 'x1',
				},
			],
			detector: fakePartial<StormDetector>({
				observe: () => {
					throw 'a bare string';
				},
			}),
		});
		expect(result.isError).toBe(true);
	});
});
