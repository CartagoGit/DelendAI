/**
 * urgent-turn.service.spec.ts — the urgent lane reads the integration
 * branch's certification through `gh api`, and unknown is never urgent.
 */
import { describe, expect, it } from 'vitest';

import { urgentReasonOf } from '@delendai/core/lib/work-units/urgent-turn.service';

const request = (
	runForge: (args: readonly string[], cwd: string) => string,
	log: (line: string) => void = () => undefined,
) => ({
	root: '/project',
	args: [],
	proposal: 'x00001',
	integration: 'develop',
	runForge,
	log,
});

describe('urgentReasonOf', () => {
	it('asks the API for the policy branch in the project root and is urgent when it is red', async () => {
		const calls: { args: readonly string[]; cwd: string }[] = [];
		const reason = await urgentReasonOf(
			request((args, cwd) => {
				calls.push({ args, cwd });
				return 'failure\n';
			}),
		);
		expect(reason).toContain('whose latest certification is red');
		expect(calls).toHaveLength(1);
		expect(calls[0]?.cwd).toBe('/project');
		expect(calls[0]?.args[0]).toBe('api');
		expect(calls[0]?.args[1]).toBe(
			'repos/{owner}/{repo}/actions/workflows/ci.yml/runs?branch=develop&status=completed&per_page=1',
		);
	});

	it('is not urgent when the integration branch is green', async () => {
		expect(
			await urgentReasonOf(request(() => 'success\n')),
		).toBeUndefined();
	});

	it('is not urgent, and says why, when the forge call fails', async () => {
		const lines: string[] = [];
		const reason = await urgentReasonOf(
			request(
				() => {
					throw new Error('gh: not logged in\nmore');
				},
				(line) => lines.push(line),
			),
		);
		expect(reason).toBeUndefined();
		expect(lines.join('')).toContain('gh: not logged in');
		expect(lines.join('')).toContain('not urgent');
	});

	it('is not urgent, and says why, when no run has finished', async () => {
		const lines: string[] = [];
		const reason = await urgentReasonOf(
			request(
				() => '',
				(line) => lines.push(line),
			),
		);
		expect(reason).toBeUndefined();
		expect(lines.join('')).toContain('no finished ci.yml run on develop');
	});

	it('is urgent when the caller says so, without asking the forge', async () => {
		const reason = await urgentReasonOf({
			...request(() => {
				throw new Error('must not be called');
			}),
			args: ['--urgent=release blocker'],
		});
		expect(reason).toBe('release blocker');
	});

	it('is not urgent for a unit with no proposal or a non-fix proposal', async () => {
		const forge = () => {
			throw new Error('must not be called');
		};
		expect(
			await urgentReasonOf({ ...request(forge), proposal: undefined }),
		).toBeUndefined();
		expect(
			await urgentReasonOf({ ...request(forge), proposal: 'f00001' }),
		).toBeUndefined();
	});

	it('runs the real gh in the project root and is not urgent when it cannot', async () => {
		const lines: string[] = [];
		const reason = await urgentReasonOf({
			root: '/nonexistent-delendai-root',
			args: [],
			proposal: 'x00001',
			integration: 'develop',
			log: (line) => lines.push(line),
		});
		expect(reason).toBeUndefined();
		expect(lines.join('')).toContain('not urgent');
	});
});
