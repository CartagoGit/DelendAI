/**
 * hermetic-environment.helper.spec.ts — what a spec inherits from the
 * shell that runs it: none of delendai's variables but the runner's own,
 * and nothing that names an agent.
 */
import { describe, expect, it } from 'vitest';

import { clearAmbientEnvironment } from '@delendai/test-kit';

const markers = { names: ['CLAUDECODE', 'AI_AGENT'], prefixes: ['CODEX_'] };

describe('clearAmbientEnvironment', () => {
	it('removes every delendai variable and every marker, and keeps the rest', () => {
		const env: NodeJS.ProcessEnv = {
			DELENDAI_SESSION_ID: 's1',
			DELENDAI_SESSION: '1',
			DELENDAI_AGENT_ID: 'claude-opus-5-5',
			DELENDAI_ANYTHING_NEW: 'x',
			CLAUDECODE: '1',
			AI_AGENT: 'claude-code_1_agent',
			CODEX_SANDBOX: 'seatbelt',
			DELENDAI_RECORD_READS: '/tmp/reads',
			DELENDAI_TEST_COMPUTE_LOCK_PATH: '/tmp/lock',
			PATH: '/usr/bin',
		};
		const removed = clearAmbientEnvironment(markers, env);
		expect([...removed].sort()).toEqual([
			'AI_AGENT',
			'CLAUDECODE',
			'CODEX_SANDBOX',
			'DELENDAI_AGENT_ID',
			'DELENDAI_ANYTHING_NEW',
			'DELENDAI_SESSION',
			'DELENDAI_SESSION_ID',
		]);
		expect(env).toEqual({
			DELENDAI_RECORD_READS: '/tmp/reads',
			DELENDAI_TEST_COMPUTE_LOCK_PATH: '/tmp/lock',
			PATH: '/usr/bin',
		});
	});

	it('acts on the process environment by default', () => {
		process.env.DELENDAI_SESSION_ID = 'late';
		expect(clearAmbientEnvironment(markers)).toContain(
			'DELENDAI_SESSION_ID',
		);
		expect(process.env.DELENDAI_SESSION_ID).toBeUndefined();
	});
});
