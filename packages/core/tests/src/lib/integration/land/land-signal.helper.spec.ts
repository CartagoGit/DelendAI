import { describe, expect, it } from 'vitest';

import { LAND_QUEUED_PASS_FRESH_SECONDS } from '@delendai/core/lib/integration/land/land.constant';
import { wakeIntegratorStep } from '@delendai/core/lib/integration/land/land-signal.helper';

const script = (promote?: string): string =>
	wakeIntegratorStep({
		branchExpression: 'develop',
		...(promote === undefined ? {} : { promoteExpression: promote }),
	}).join('\n');

describe('wakeIntegratorStep', () => {
	it('[<50ms] skips the dispatch when a fresh pass is already queued for the branch', () => {
		const text = script();
		expect(text).toContain(
			'IN("queued", "pending", "waiting", "requested")',
		);
		expect(text).toContain('endswith("-pass-" + $ENV.BRANCH)');
		expect(text).toContain(
			`now - ${String(LAND_QUEUED_PASS_FRESH_SECONDS)}`,
		);
		expect(text.indexOf('exit 0')).toBeLessThan(
			text.indexOf('gh workflow run'),
		);
	});

	it('[<50ms] counts only a queued run: one in progress may have read the forge before this event', () => {
		const text = script();
		expect(text).not.toContain('in_progress');
		expect(text.match(/IN\(/gu)).toHaveLength(1);
	});

	it('[<50ms] never skips a dispatch that carries the promote flag', () => {
		expect(script("${{ 'true' }}")).toContain('if [ -z "${PROMOTE:-}" ]');
	});

	it('[<50ms] still dispatches with the promote flag when the guard does not apply', () => {
		expect(script("${{ 'true' }}")).toContain('-f promote="${PROMOTE}"');
	});
});
