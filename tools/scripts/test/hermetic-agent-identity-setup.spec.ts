/**
 * hermetic-agent-identity-setup.spec.ts — a spec run from a shell that
 * exported a session, an agent id and the host markers sees none of them.
 *
 * Run it as `DELENDAI_SESSION_ID=s DELENDAI_AGENT_ID=a CLAUDECODE=1
 * AI_AGENT=x vitest run <this file>`: the shared setup has already run,
 * so the variables are gone before the first line here, and the unit a
 * session-less entry gets is a fresh one, not the shell's.
 */
import { describe, expect, it, vi } from 'vitest';

describe('the shared setup', () => {
	it('hands no spec a session, an agent id or a host marker from the shell', () => {
		for (const name of [
			'DELENDAI_SESSION_ID',
			'DELENDAI_SESSION',
			'DELENDAI_AGENT_ID',
			'CLAUDECODE',
			'AI_AGENT',
		]) {
			expect(process.env[name], name).toBeUndefined();
		}
	});

	it('clears what a spec set when it runs again for the next file', async () => {
		process.env.DELENDAI_SESSION_ID = 'set-by-a-spec';
		process.env.CLAUDECODE = '1';
		process.env.DELENDAI_TEST_COMPUTE_WAIT_NOTICE_MS = '5';
		vi.resetModules();
		await import('./hermetic-agent-identity-setup');
		expect(process.env.DELENDAI_SESSION_ID).toBeUndefined();
		expect(process.env.CLAUDECODE).toBeUndefined();
		expect(process.env.DELENDAI_TEST_COMPUTE_WAIT_NOTICE_MS).toBe('5');
		delete process.env.DELENDAI_TEST_COMPUTE_WAIT_NOTICE_MS;
	});
});
