/**
 * routed-tool.helper.spec.ts — a call through the capability router is
 * measured under the tool it reached (f00645).
 */
import { describe, expect, it } from 'vitest';

import { buildRecord } from '../../../src/lib/record';
import { toolReachedBy } from '../../../src/lib/routed-tool.helper';

const routed = (structuredContent: unknown) => ({
	content: [{ type: 'text', text: '{}' }],
	structuredContent,
});

describe('toolReachedBy', () => {
	it('names the tool the router reached', () => {
		expect(
			toolReachedBy(
				'delendai_resolve_capability',
				routed({
					status: 'ok',
					qualifiedName: 'delendai_proposals_review_queue',
					result: {},
				}),
			),
		).toBe('delendai_proposals_review_queue');
	});

	it('keeps a refused route, and every other tool, as it was called', () => {
		expect(
			toolReachedBy(
				'delendai_resolve_capability',
				routed({ status: 'terminal', reason: 'catalog_missing' }),
			),
		).toBe('delendai_resolve_capability');
		expect(
			toolReachedBy(
				'delendai_proposals_review_queue',
				routed({ status: 'ok', qualifiedName: 'delendai_other' }),
			),
		).toBe('delendai_proposals_review_queue');
		expect(toolReachedBy('delendai_resolve_capability', undefined)).toBe(
			'delendai_resolve_capability',
		);
	});
});

describe('a routed call in the usage record', () => {
	it('is booked to the tool it reached, in the plugin that owns it', () => {
		const record = buildRecord({
			toolName: 'delendai_resolve_capability',
			corePrefix: 'delendai',
			peerPrefixes: ['proposals'],
			agent: { id: 'agent-a', kind: 'claude-code', extension: 'cli' },
			sessionId: 'sess-routed',
			args: {},
			result: routed({
				status: 'ok',
				qualifiedName: 'delendai_proposals_review_queue',
				result: {},
			}),
			endedAt: 1_752_000_000_000,
			responseBytes: 620_691,
			costOf: () => null,
		});

		expect(record).toMatchObject({
			plugin: 'proposals',
			tool: 'review_queue',
			responseBytes: 620_691,
		});
	});
});
