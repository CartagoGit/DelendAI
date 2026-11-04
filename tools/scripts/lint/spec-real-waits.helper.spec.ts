import { describe, expect, it } from 'vitest';

import {
	countSlowSetup,
	isE2eTier,
	isFastSpec,
} from './spec-real-waits.helper';

describe('isFastSpec', () => {
	it('is every spec outside the e2e tier', () => {
		expect(isFastSpec('a/b.spec.ts')).toBe(true);
		expect(isFastSpec('a/b.e2e.spec.ts')).toBe(false);
		expect(isFastSpec('tests/e2e/b.spec.ts')).toBe(false);
		expect(isFastSpec('a/b.ts')).toBe(false);
		expect(isE2eTier('a/e2e/b.spec.ts')).toBe(true);
	});
});

describe('countSlowSetup', () => {
	it('counts literal timers, shell sleeps and git init', () => {
		const text = [
			'await new Promise((r) => setTimeout(r, 250));',
			"checkoutWithGate('sleep 2 && echo ran')",
			"execFileSync('git', ['init', '-q'], { cwd });",
			"git(root, 'init', '-q', '-b', 'develop');",
			'await Bun.sleep(5);',
		].join('\n');
		expect(countSlowSetup(text)).toBe(5);
	});

	it('ignores comments, fake-clock use and timers with a variable delay', () => {
		const text = [
			'// setTimeout(r, 250) was here',
			' * sleep 2 in the old gate',
			'clock.advance(1500);',
			'setTimeout(done, delayMs);',
		].join('\n');
		expect(countSlowSetup(text)).toBe(0);
	});
});
