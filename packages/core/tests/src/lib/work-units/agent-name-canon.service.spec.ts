/**
 * agent-name-canon.service.spec.ts — one shape for every agent's name.
 */
import { describe, expect, it } from 'vitest';

import { describeAgentNameShape } from '../../../../src/lib/work-units/agent-name-canon.service';

describe('the shape of an agent name', () => {
	it('takes the names of every model that signed today, written in the canon', () => {
		for (const name of [
			'glm-5.3-flash',
			'qwen-3.8-flash',
			'gpt-5.4',
			'gemini-3.8-flash',
			'minimax-m3.1-flash-preview',
			'claude-opus-5-5',
			'claude-haiku-4-5-20251001',
		]) {
			expect(describeAgentNameShape(name), name).toBeUndefined();
		}
	});

	it('refuses a maker fused with its version, and shows it apart', () => {
		expect(describeAgentNameShape('qwen3-flash')).toContain('`qwen-3…`');
	});

	it('refuses a name with no version, an effort word, or another spelling', () => {
		expect(describeAgentNameShape('gemini-flash')).toContain('no version');
		expect(describeAgentNameShape('gemini-3.8-flash-high')).toContain(
			'how hard',
		);
		expect(describeAgentNameShape('Qwen-3.8-Flash')).toContain('lowercase');
		expect(describeAgentNameShape('qwen--3.8')).toContain('single hyphens');
	});

	it("leaves the product's own actors their names", () => {
		expect(
			describeAgentNameShape('delendai-queue', 'delendai'),
		).toBeUndefined();
		expect(describeAgentNameShape('delendai-queue')).toContain(
			'no version',
		);
	});
});
