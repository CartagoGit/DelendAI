import { describe, expect, it } from 'vitest';

import {
	gitFailureText,
	landGitArgs,
} from '../../../../src/lib/services/land-git-process.helper';

describe('the integrator git process', () => {
	it('[<5ms] turns every client hook off ahead of the command', () => {
		expect(landGitArgs(['push', 'origin'])).toEqual([
			'-c',
			'core.hooksPath=/dev/null',
			'push',
			'origin',
		]);
	});

	it('[<5ms] reports both stdout and stderr of a failed call', () => {
		expect(
			gitFailureText({ stdout: 'hook said\n', stderr: 'git said\n' }),
		).toBe('hook said\ngit said');
		expect(gitFailureText(new Error('boom'))).toContain('boom');
		expect(gitFailureText({ stdout: Buffer.from('b\n') })).toBe('b');
	});
});
