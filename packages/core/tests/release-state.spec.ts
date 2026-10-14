import { describe, expect, it } from 'vitest';

import {
	assertExpectedReleaseState,
	evaluateReleaseReadiness,
	ReleaseStateError,
} from '@delendai/core/public';

describe('release R2 state contracts', () => {
	const expected = {
		sourceDevelopSha: '1111111',
		mainSha: '2222222',
		mainVersion: '1.4.2',
	};

	it('reports stale source, main and version as typed errors', () => {
		for (const [key, actual, code] of [
			['sourceDevelopSha', '3333333', 'stale-source'],
			['mainSha', '4444444', 'stale-main'],
			['mainVersion', '1.4.3', 'stale-version'],
		] as const) {
			const value = { ...expected, [key]: actual };
			try {
				assertExpectedReleaseState(expected, value);
				expect.fail('expected a stale release state error');
			} catch (error) {
				expect(error).toBeInstanceOf(ReleaseStateError);
				expect(error).toMatchObject({ code });
			}
		}
	});

	it('blocks readiness on required gates but ignores optional failures', () => {
		expect(
			evaluateReleaseReadiness([
				{ name: 'typecheck', status: 'passed' },
				{ name: 'lint', status: 'failed' },
				{ name: 'docs', status: 'failed', required: false },
			]),
		).toMatchObject({ ready: false, blockingGates: ['lint'] });
	});
});
