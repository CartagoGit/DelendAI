/**
 * hermetic-environment.helper.spec.ts — what a spec inherits from the
 * shell that runs it: none of delendai's variables but the runner's own,
 * and nothing that names an agent.
 */
import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { clearAmbientEnvironment } from '@delendai/test-kit';

const markers = { names: ['CLAUDECODE', 'AI_AGENT'], prefixes: ['CODEX_'] };

describe('clearAmbientEnvironment', () => {
	it('[<11ms] removes every delendai variable and every marker, and keeps the rest', () => {
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
			GH_TOKEN: 'a',
			GITHUB_TOKEN: 'b',
			GH_ENTERPRISE_TOKEN: 'c',
			GH_CONFIG_DIR: '/home/me/.config/gh',
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
			'GH_ENTERPRISE_TOKEN',
			'GH_TOKEN',
			'GITHUB_TOKEN',
		]);
		const { GH_CONFIG_DIR: configDir, ...rest } = env;
		expect(rest).toEqual({
			DELENDAI_RECORD_READS: '/tmp/reads',
			DELENDAI_TEST_COMPUTE_LOCK_PATH: '/tmp/lock',
			PATH: '/usr/bin',
		});
		// `gh` looks for its login in an empty directory, not the user's.
		expect(configDir).not.toBe('/home/me/.config/gh');
		expect(readdirSync(configDir ?? '')).toEqual([]);
	});

	it('[<6ms] acts on the process environment by default', () => {
		process.env.DELENDAI_SESSION_ID = 'late';
		expect(clearAmbientEnvironment(markers)).toContain(
			'DELENDAI_SESSION_ID',
		);
		expect(process.env.DELENDAI_SESSION_ID).toBeUndefined();
	});
});
