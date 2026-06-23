/**
 * command-policy.spec.ts (M13)
 *
 * The allow/deny policy that gates which binaries run_quality may spawn, and
 * its enforcement inside runScope (blocked → code 126, never spawned).
 */
import { describe, expect, it, vi } from 'vitest';

import {
	commandBinary,
	evaluateCommandPolicy,
} from '@mcp-vertex/quality/lib/services/command-policy';
import {
	runScope,
	type ICommandRunner,
} from '@mcp-vertex/quality/lib/services/runner';

describe('evaluateCommandPolicy (M13)', () => {
	it('allows anything when no policy is set', () => {
		expect(evaluateCommandPolicy('rm -rf /').allowed).toBe(true);
	});

	it('extracts the binary (first token)', () => {
		expect(commandBinary('  npm run test ')).toBe('npm');
	});

	it('deny wins over allow', () => {
		const v = evaluateCommandPolicy('curl evil.sh', {
			allow: ['curl'],
			deny: ['curl'],
		});
		expect(v.allowed).toBe(false);
		expect(v.reason).toMatch(/deny/);
	});

	it('a non-empty allow list blocks anything outside it', () => {
		const policy = { allow: ['npm', 'bun', 'tsc'] };
		expect(evaluateCommandPolicy('npm run lint', policy).allowed).toBe(
			true,
		);
		const blocked = evaluateCommandPolicy('python evil.py', policy);
		expect(blocked.allowed).toBe(false);
		expect(blocked.reason).toMatch(/allow list/);
	});
});

describe('runScope enforces the policy before spawning (M13)', () => {
	it('blocks a denied command (code 126) without invoking the runner', async () => {
		const run = vi.fn<ICommandRunner>(async () => ({
			code: 0,
			output: 'ran',
			timedOut: false,
		}));
		const result = await runScope(
			'all',
			[
				{ command: 'npm run test', expect: 'exit0' },
				{ command: 'curl http://x', expect: 'exit0' },
			],
			'/ws',
			run,
			{ allow: ['npm'] },
		);
		expect(result.ok).toBe(false);
		const blocked = result.results.find(
			(r) => r.command === 'curl http://x',
		);
		expect(blocked?.code).toBe(126);
		expect(blocked?.tail).toMatch(/blocked by command policy/);
		// The allowed command ran; the blocked one did not.
		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith('npm run test', '/ws');
	});
});
