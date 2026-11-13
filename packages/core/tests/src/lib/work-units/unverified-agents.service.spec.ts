import { describe, expect, it } from 'vitest';

import { unverifiedAgents } from '@delendai/core/lib/work-units/unverified-agents.service';

describe('unverifiedAgents', () => {
	it('names each agent no seen model and no roster entry confirms, once', () => {
		expect(
			unverifiedAgents({
				agents: [
					'glm-5.3-flash',
					'delendai-m3-docs-20261028',
					'delendai-m3-docs-20261028',
					'qwen-3.8-flash',
					'delendai-queue',
				],
				seen: ['glm-5.3-flash'],
				roster: ['qwen-3.8-flash'],
				namespacePrefix: 'delendai',
			}).map((each) => each.agent),
		).toEqual(['delendai-m3-docs-20261028']);
	});
});
