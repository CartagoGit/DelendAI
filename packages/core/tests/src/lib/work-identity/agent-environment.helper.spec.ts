/**
 * agent-environment.helper.spec.ts — telling an agent's shell from a person's.
 */
import { describe, expect, it } from 'vitest';

import {
	agentEnvironmentMarker,
	agentHostMarker,
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

describe('agentHostMarker', () => {
	it('names the host marker, not the declaration or the convention', () => {
		expect(agentHostMarker({ DELENDAI_AGENT_ID: 'gpt-6.1-sol' })).toBe(
			undefined,
		);
		expect(agentHostMarker({ AI_AGENT: 'claude-code_2_agent' })).toBe(
			undefined,
		);
		expect(agentHostMarker({ OPENCODE: '1' })).toBe('OPENCODE');
		expect(agentHostMarker({ CODEX_SANDBOX: 'seatbelt' })).toBe(
			'CODEX_SANDBOX',
		);
	});

	it('ignores a profile variable a person may export', () => {
		expect(agentHostMarker({ CODEX_HOME: '/home/me/.codex' })).toBe(
			undefined,
		);
		expect(
			agentHostMarker({ CODEX_HOME: '/x', CURSOR_TRACE_ID: 't' }),
		).toBe('CURSOR_TRACE_ID');
	});
});
