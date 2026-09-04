import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	STABLE_API_TOOL_NAMES,
	STABLE_API_TOOLS,
	clearStableToolDescriptorContributions,
	findStableDescriptor,
	resetStableToolDescriptorRegistryForTests,
} from '@delendai/core/lib/api/stable-facade';

import {
	PROPOSALS_STABLE_TOOLS,
	registerProposalsStableTools,
} from '@delendai/proposals/lib/api/proposals-stable-tools';

describe('proposals stable tools', () => {
	beforeEach(() => {
		resetStableToolDescriptorRegistryForTests();
	});

	afterEach(() => {
		clearStableToolDescriptorContributions();
	});

	it('preserves the historical ten stable descriptors verbatim', () => {
		expect(
			PROPOSALS_STABLE_TOOLS.map((descriptor) => descriptor.name),
		).toEqual([
			'proposal_transition',
			'proposals_close_plan',
			'proposal_create',
			'auto_work',
			'agent_lock',
			'agent_worktree',
			'proposal_review',
			'task_queue_enqueue',
			'state_repair',
			'proposal_force_transition',
		]);
		expect(
			PROPOSALS_STABLE_TOOLS.every(
				(descriptor) => descriptor.plugin === 'proposals',
			),
		).toBe(true);
	});

	it('registers the proposals contribution into the core facade registry', () => {
		registerProposalsStableTools();

		expect(STABLE_API_TOOL_NAMES).toEqual(
			PROPOSALS_STABLE_TOOLS.map((descriptor) => descriptor.name),
		);
		expect(STABLE_API_TOOLS).toHaveLength(PROPOSALS_STABLE_TOOLS.length);
		expect(findStableDescriptor('proposal_review')?.summary).toBe(
			'Submit/approve/request-changes on a proposal in review.',
		);
		expect(findStableDescriptor('proposals_close_plan')?.summary).toBe(
			'Close a plan proposal after checking every blocker.',
		);
	});

	it('replaces the same contributor instead of duplicating entries', () => {
		registerProposalsStableTools();
		registerProposalsStableTools();

		expect(STABLE_API_TOOLS).toHaveLength(PROPOSALS_STABLE_TOOLS.length);
	});
});
