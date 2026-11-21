/**
 * dependabot-fixes.lib.spec.ts — an alert is fixed only when the integration
 * lockfile resolves the patched version or newer.
 */
import { describe, expect, it } from 'vitest';

import {
	alertsOfForgeOutput,
	classifyAlerts,
	compareVersions,
	fixedAlertLines,
	lockedVersions,
	unfixedAlertLines,
} from './dependabot-fixes.lib';

const LOCK = `{
	"packages": {
		"astro": ["astro@5.2.0", "", {}, "h"],
		"old/astro": ["astro@4.1.0", "", {}, "h"],
		"left-pad": ["left-pad@1.0.0", "", {}, "h"],
	},
}`;

const alert = (
	number: number,
	pkg: string,
	patched: string | null,
): {
	number: number;
	package: string;
	patched: string | null;
	severity: string;
} => ({
	number,
	package: pkg,
	patched,
	severity: 'high',
});

describe('dependabot fixes', () => {
	it('[<5ms] reads every locked version of a package', () => {
		expect(lockedVersions(LOCK, 'astro')).toEqual(['5.2.0', '4.1.0']);
		expect(lockedVersions(LOCK, 'astr')).toEqual([]);
	});

	it('[<5ms] compares versions numerically', () => {
		expect(compareVersions('5.10.0', '5.9.0')).toBeGreaterThan(0);
		expect(compareVersions('5.2', '5.2.0')).toBe(0);
		expect(compareVersions('5.2.0-beta.1', '5.2.0')).toBe(0);
	});

	it('[<5ms] lists an alert whose patch is on the integration branch as fixed', () => {
		const fixes = classifyAlerts([alert(84, 'astro', '5.1.0')], LOCK);
		expect(fixes.unfixed).toEqual([]);
		expect(fixedAlertLines(fixes)).toEqual([
			'closes Dependabot alert #84 astro (high): patched in 5.1.0',
		]);
	});

	it('[<5ms] reports an alert with no fix or an older lock as unfixed', () => {
		const fixes = classifyAlerts(
			[
				alert(85, 'astro', '5.9.0'),
				alert(86, 'left-pad', null),
				alert(87, 'astro', '4.2.0'),
			],
			LOCK,
		);
		expect(fixes.fixed).toEqual([]);
		expect(unfixedAlertLines(fixes)).toEqual([
			'Dependabot alert #85 astro (high) stays open: the integration branch is below 5.9.0',
			'Dependabot alert #86 left-pad (high) stays open: its advisory has no patched version',
			'Dependabot alert #87 astro (high) stays open: the integration branch is below 4.2.0',
		]);
	});

	it('[<5ms] counts a package gone from the lockfile as fixed', () => {
		expect(
			classifyAlerts([alert(1, 'gone', '1.0.0')], LOCK).fixed,
		).toHaveLength(1);
	});

	it('[<5ms] parses the forge rows one per line', () => {
		expect(
			alertsOfForgeOutput(
				`${JSON.stringify(alert(1, 'a', '1.0.0'))}\n\n`,
			),
		).toEqual([alert(1, 'a', '1.0.0')]);
	});
});
