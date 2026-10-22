/**
 * prepare-release.spec.ts — the bump and the changelog section a promotion
 * carries, from the proposals it finished.
 */
import { describe, expect, it } from 'vitest';

import {
	nextVersion,
	proposalOf,
	releaseBump,
	releaseSection,
	withSection,
	type IReleasedProposal,
} from './prepare-release.script';

const p = (
	id: string,
	kind: string,
	title = `${kind} ${id}`,
): IReleasedProposal => ({
	id,
	kind,
	title,
});

describe('releaseBump', () => {
	it('is a patch when every proposal is a fix', () => {
		expect(releaseBump([p('x1', 'fix'), p('x2', 'fix')], '0.2.0')).toBe(
			'patch',
		);
	});

	it('is a minor as soon as one is not a fix', () => {
		expect(releaseBump([p('x1', 'fix'), p('f1', 'feat')], '0.2.0')).toBe(
			'minor',
		);
		expect(releaseBump([p('c1', 'chore')], '0.2.0')).toBe('minor');
	});

	it('is a major for a breaking change from 1.0 on, a minor below it', () => {
		expect(releaseBump([p('b1', 'breaking')], '1.4.0')).toBe('major');
		expect(releaseBump([p('b1', 'breaking')], '0.4.0')).toBe('minor');
	});
});

describe('nextVersion', () => {
	it('raises the part the bump names and resets the ones below it', () => {
		expect(nextVersion('0.1.1', 'minor')).toBe('0.2.0');
		expect(nextVersion('0.2.0', 'patch')).toBe('0.2.1');
		expect(nextVersion('1.4.2', 'major')).toBe('2.0.0');
	});
});

describe('releaseSection', () => {
	it('groups proposals the Keep-a-Changelog way, plans and audits by id only', () => {
		expect(
			releaseSection('0.2.0', '2026-10-22', [
				p('x2', 'fix', 'A bug is gone'),
				p('f1', 'feat', 'A thing is new'),
				p('q1', 'plan'),
				p('a1', 'audit'),
				p('r1', 'refactor', 'A thing is tidier'),
			]),
		).toBe(
			[
				'## [0.2.0] — 2026-10-22',
				'',
				'### Added',
				'',
				'- A thing is new (f1)',
				'',
				'### Changed',
				'',
				'- A thing is tidier (r1)',
				'',
				'### Fixed',
				'',
				'- A bug is gone (x2)',
				'',
				'### Plans and audits',
				'',
				'a1, q1.',
				'',
			].join('\n'),
		);
	});
});

describe('withSection', () => {
	it('places the new release above every earlier one, below the preamble', () => {
		const changelog =
			'# Changelog\n\nIntro.\n\n## [0.1.0] — 2026-01-01\n\nold\n';
		expect(withSection(changelog, '## [0.2.0] — 2026-10-22\n\nnew\n')).toBe(
			'# Changelog\n\nIntro.\n\n## [0.2.0] — 2026-10-22\n\nnew\n\n## [0.1.0] — 2026-01-01\n\nold\n',
		);
		expect(withSection('# Changelog\n', 'S\n')).toBe('# Changelog\n\nS\n');
	});

	it('replaces the section an unpublished release already has', () => {
		const changelog =
			'# Changelog\n\n## [0.2.0] — 2026-10-21\n\nfirst\n\n## [0.1.0] — 2026-01-01\n\nold\n';
		expect(
			withSection(changelog, '## [0.2.0] — 2026-10-22\n\nmore\n'),
		).toBe(
			'# Changelog\n\n## [0.2.0] — 2026-10-22\n\nmore\n\n## [0.1.0] — 2026-01-01\n\nold\n',
		);
	});
});

describe('proposalOf', () => {
	it('reads id, kind and title from the frontmatter, and nothing from a file without them', () => {
		expect(
			proposalOf(
				'---\nid: f00787\ntitle: "Every \\"promotion\\" is versioned"\nkind: feat\n---\n',
			),
		).toEqual({
			id: 'f00787',
			kind: 'feat',
			title: 'Every "promotion" is versioned',
		});
		expect(proposalOf('# no frontmatter')).toBeUndefined();
	});
});
