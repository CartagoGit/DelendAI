/**
 * packs.spec.ts — the capability packs of the proposals surface.
 *
 * Pure layer: every registration id sits in exactly one pack, and what a
 * fresh session lists belongs to the read pack plus the start verb.
 * Wire layer: a session that only reads lists no author, review, work
 * (beyond the start verb) or repair tool, yet a call to a tool of
 * another pack still succeeds through the router.
 */
import { describe, expect, it } from 'vitest';

import { measureBootstrapBytes } from '@delendai/core/public';
import { managedLazyPluginEntry } from '@delendai/core/lib/plugins/managed-lazy-catalog-lookup';

import {
	PROPOSALS_ESSENTIAL_TOOL_IDS,
	PROPOSALS_TOOL_IDS,
} from '@delendai/proposals/lib/surface/disclosure';
import { PROPOSALS_TOOL_PACK } from '@delendai/proposals/lib/contracts/constants/proposals-tool-pack.constant';
import type { IProposalsPack } from '@delendai/proposals/lib/contracts/interfaces/proposals-pack.interface';
import {
	proposalsPackOf,
	proposalsToolIdsInPack,
} from '@delendai/proposals/lib/surface/packs';

import { createAssembledProposalsServer } from '../e2e/assembled-proposals-server';

const PACKS: readonly IProposalsPack[] = [
	'read',
	'author',
	'review',
	'work',
	'repair',
];
const START_VERB = 'auto_work';
const READ_SESSION_BYTE_CEILING = 8_000;
/** The measured bytes of the fixed eight-tool essential set this replaced. */
const PREVIOUS_ESSENTIAL_BYTES = 16_999;

describe('proposals capability packs — pure', () => {
	it('places every real registration id in exactly one pack', () => {
		const real = managedLazyPluginEntry('proposals')?.toolIds ?? [];
		expect(real.length).toBeGreaterThan(0);
		expect(Object.keys(PROPOSALS_TOOL_PACK).sort()).toEqual(
			[...real].sort(),
		);
		const grouped = PACKS.flatMap((pack) => proposalsToolIdsInPack(pack));
		expect([...grouped].sort()).toEqual([...PROPOSALS_TOOL_IDS].sort());
	});

	it('lists in a fresh session only the read pack and the start verb', () => {
		for (const id of PROPOSALS_ESSENTIAL_TOOL_IDS) {
			if (id === START_VERB) continue;
			expect(proposalsPackOf(id)).toBe('read');
		}
	});
});

describe('proposals capability packs — real wire', () => {
	it('a read-only session lists only the read pack, and a tool of another pack still answers', async () => {
		const harness = await createAssembledProposalsServer({
			progressiveDisclosure: true,
		});
		try {
			const { tools } = await harness.client.listTools();
			const proposalsTools = tools.filter((tool) =>
				tool.name.startsWith('delendai_proposals_'),
			);
			const listed = proposalsTools.map((tool) =>
				tool.name.replace('delendai_proposals_', ''),
			);
			for (const id of listed) {
				if (id === START_VERB) continue;
				expect(
					PROPOSALS_TOOL_PACK[id as keyof typeof PROPOSALS_TOOL_PACK],
				).toBe('read');
			}
			const bytes = measureBootstrapBytes(proposalsTools).bytes;
			expect(bytes).toBeLessThanOrEqual(READ_SESSION_BYTE_CEILING);
			expect(bytes).toBeLessThan(PREVIOUS_ESSENTIAL_BYTES);

			// `state_health` is in the repair pack: unlisted, yet it answers.
			expect(listed).not.toContain('state_health');
			const result = await harness.callTool('delendai_compact_router', {
				domain: 'proposals',
				action: 'state_health',
				args: {},
			});
			expect(result.ok).toBe(true);
			expect(result.structured).toMatchObject({
				routed: true,
				tool: 'delendai_proposals_state_health',
				isError: false,
			});
		} finally {
			await harness.close();
		}
	});
});
