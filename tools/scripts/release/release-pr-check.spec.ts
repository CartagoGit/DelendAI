/**
 * release-pr-check.spec.ts — a promotion without a version and a changelog
 * section is not a release.
 */
import { describe, expect, it } from 'vitest';

import { isLaterVersion, promotionGaps } from './release-pr-check.script';

const changelog = '# Changelog\n\n## [0.2.0] — 2026-10-22\n\n### Added\n';

describe('promotionGaps', () => {
	it('passes a later version with a dated section', () => {
		expect(
			promotionGaps({
				headVersion: '0.2.0',
				baseVersion: '0.1.1',
				changelog,
				today: '2026-10-22',
			}),
		).toEqual([]);
	});

	it('names an unchanged version and a missing section', () => {
		expect(
			promotionGaps({
				headVersion: '0.1.1',
				baseVersion: '0.1.1',
				changelog,
				today: '2026-10-22',
			}),
		).toEqual([
			"the version 0.1.1 is not above main's 0.1.1",
			'CHANGELOG.md has no "## [0.1.1] — <date>" section',
		]);
	});

	it('refuses a section dated after today', () => {
		expect(
			promotionGaps({
				headVersion: '0.2.0',
				baseVersion: '0.1.1',
				changelog,
				today: '2026-10-21',
			}),
		).toEqual([
			'the CHANGELOG section for 0.2.0 is dated 2026-10-22, after today',
		]);
	});
});

describe('isLaterVersion', () => {
	it('compares part by part, not as text', () => {
		expect(isLaterVersion('0.10.0', '0.9.9')).toBe(true);
		expect(isLaterVersion('1.0.0', '1.0.0')).toBe(false);
		expect(isLaterVersion('0.2.0', '0.10.0')).toBe(false);
	});
});
