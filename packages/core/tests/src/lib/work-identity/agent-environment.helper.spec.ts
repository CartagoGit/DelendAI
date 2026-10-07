/**
 * agent-environment.helper.spec.ts — telling an agent's shell from a person's.
 */
import { describe, expect, it } from 'vitest';

import {
	agentEnvironmentMarker,
	isAgentEnvironmentVariable,
} from '../../../../src/lib/work-identity/agent-environment.helper';

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

describe('host markers', () => {
	it('recognises other hosts, by name and by prefix', () => {
		expect(agentEnvironmentMarker({ GEMINI_CLI: '1' })).toBe('GEMINI_CLI');
		expect(agentEnvironmentMarker({ CODEX_SANDBOX: 'seatbelt' })).toBe(
			'CODEX_SANDBOX',
		);
		expect(agentEnvironmentMarker({ CURSOR_TRACE_ID: 'abc' })).toBe(
			'CURSOR_TRACE_ID',
		);
		expect(agentEnvironmentMarker({ CODEX_HOME: '' })).toBe(undefined);
	});

	it('says which variables a server should be told about', () => {
		expect(isAgentEnvironmentVariable('CODEX_CI')).toBe(true);
		expect(isAgentEnvironmentVariable('CLAUDECODE')).toBe(true);
		expect(isAgentEnvironmentVariable('HOME')).toBe(false);
	});
});
