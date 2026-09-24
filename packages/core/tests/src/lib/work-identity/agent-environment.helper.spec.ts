/**
 * agent-environment.helper.spec.ts — telling an agent's shell from a person's.
 */
import { describe, expect, it } from 'vitest';

import { agentEnvironmentMarker } from '../../../../src/lib/work-identity/agent-environment.helper';

describe('agentEnvironmentMarker', () => {
	it('is undefined in a person shell', () => {
		expect(agentEnvironmentMarker({ HOME: '/home/me', PATH: '/bin' })).toBe(
			undefined,
		);
	});

	it('names the first marker an agent runtime set', () => {
		expect(agentEnvironmentMarker({ CLAUDECODE: '1' })).toBe('CLAUDECODE');
		expect(
			agentEnvironmentMarker({
				AI_AGENT: 'claude-code_2_agent',
				CLAUDECODE: '1',
			}),
		).toBe('AI_AGENT');
		expect(agentEnvironmentMarker({ DELENDAI_AGENT_ID: 'codex' })).toBe(
			'DELENDAI_AGENT_ID',
		);
	});

	it('does not count an exported but empty variable', () => {
		expect(agentEnvironmentMarker({ AI_AGENT: '  ', CLAUDECODE: '' })).toBe(
			undefined,
		);
	});
});
