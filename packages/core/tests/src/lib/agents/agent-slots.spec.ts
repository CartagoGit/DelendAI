import { describe, expect, it } from 'vitest';

import {
	AGENT_SLOTS,
	SUBAGENT_SLOTS,
	type IAgentSlot,
	type ISubagentSlot,
} from '../../../../src/lib/agents/agent-slots';

describe('agent-slots (single source of truth)', () => {
	it('declares exactly 5 canonical slots', () => {
		expect(AGENT_SLOTS).toHaveLength(5);
	});

	it('starts with the orchestrator and preserves a stable order', () => {
		expect(AGENT_SLOTS).toEqual([
			'orchestrator',
			'proposal_guardian',
			'implementation_runner',
			'delivery_verifier',
			'technical_investigator',
		]);
	});

	it('exports every slot name exactly once', () => {
		expect(new Set(AGENT_SLOTS).size).toBe(AGENT_SLOTS.length);
	});

	it('derives SUBAGENT_SLOTS as AGENT_SLOTS minus orchestrator', () => {
		expect(SUBAGENT_SLOTS).toEqual([
			'proposal_guardian',
			'implementation_runner',
			'delivery_verifier',
			'technical_investigator',
		]);
	});

	it('keeps orchestrator out of the bounded sub-slots', () => {
		expect(SUBAGENT_SLOTS).not.toContain('orchestrator');
	});

	it('exports compile-time types that round-trip through runtime values', () => {
		const slot: IAgentSlot = 'orchestrator';
		expect(AGENT_SLOTS).toContain(slot);
		const sub: ISubagentSlot = 'delivery_verifier';
		expect(SUBAGENT_SLOTS).toContain(sub);
	});
});
