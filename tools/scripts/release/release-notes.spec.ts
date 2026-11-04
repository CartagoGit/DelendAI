/**
 * release-notes.spec.ts — a release's notes are its CHANGELOG section, and
 * a version with none has none.
 */
import { describe, expect, it } from 'vitest';

import { releaseNotes } from './release-notes.script';

const changelog = [
	'# Changelog',
	'',
	'## [0.3.0] — 2026-11-01',
	'',
	'### Added',
	'',
	'- B (f2)',
	'',
	'## [0.2.0] — 2026-10-22',
	'',
	'### Fixed',
	'',
	'- A (x1)',
	'',
].join('\n');

describe('releaseNotes', () => {
	it('returns the section between its heading and the next one', () => {
		expect(releaseNotes(changelog, '0.3.0')).toBe(
			'### Added\n\n- B (f2)\n',
		);
		expect(releaseNotes(changelog, '0.2.0')).toBe(
			'### Fixed\n\n- A (x1)\n',
		);
	});

	it('has nothing for a version the changelog does not name', () => {
		expect(releaseNotes(changelog, '9.9.9')).toBeUndefined();
	});
});
