import { describe, expect, it } from 'vitest';

import { extractParallelismFromFrontmatter } from '@mcp-vertex/proposals/lib/proposals/proposal-parallelism';

// ---------------------------------------------------------------------------
// a2-proposal-parallelism-enforcement T3
// Spec for the frontmatter → IProposalParallelism extractor.
// ---------------------------------------------------------------------------

const wrap = (frontmatter: string): string =>
	`---\n${frontmatter}\n---\n\n# body\n`;

describe('extractParallelismFromFrontmatter', () => {
	it('returns null when the markdown has no frontmatter block', () => {
		const raw = '# body\nno frontmatter here\n';
		expect(extractParallelismFromFrontmatter(raw, 'p31')).toBeNull();
	});

	it('returns null when frontmatter is present but mainWriteLane is missing', () => {
		const raw = wrap('id: p31\nstatus: in_progress\n');
		expect(extractParallelismFromFrontmatter(raw, 'p31')).toBeNull();
	});

	it('returns the parallelism record when mainWriteLane and parallelismLanes are well-formed', () => {
		const raw = wrap(
			'id: p31\nstatus: in_progress\nmainWriteLane: editor\nparallelismLanes: [meta, audit, ui-demo]\n',
		);
		const got = extractParallelismFromFrontmatter(raw, 'p31');
		expect(got).toEqual({
			proposalId: 'p31',
			mainWriteLane: 'editor',
			parallelismLanes: ['meta', 'audit', 'ui-demo'],
		});
	});

	it('treats a missing parallelismLanes as [] (strict, no parallel tracks permitted)', () => {
		const raw = wrap('mainWriteLane: editor\n');
		const got = extractParallelismFromFrontmatter(raw, 'p31');
		expect(got).toEqual({
			proposalId: 'p31',
			mainWriteLane: 'editor',
			parallelismLanes: [],
		});
	});

	// M4: typo-guard is opt-in — the host supplies its own known tracks.
	const HOST_TRACKS = new Set(['editor', 'meta', 'audit']);

	it('drops unknown track names from parallelismLanes when knownTracks is given (typo guard)', () => {
		const raw = wrap(
			'mainWriteLane: editor\nparallelismLanes: [meta, banana, audit]\n',
		);
		const got = extractParallelismFromFrontmatter(raw, 'p31', HOST_TRACKS);
		expect(got).toEqual({
			proposalId: 'p31',
			mainWriteLane: 'editor',
			parallelismLanes: ['meta', 'audit'],
		});
	});

	it('returns null when mainWriteLane is not in the supplied knownTracks (typo guard)', () => {
		const raw = wrap('mainWriteLane: bananas\nparallelismLanes: [meta]\n');
		expect(
			extractParallelismFromFrontmatter(raw, 'p31', HOST_TRACKS),
		).toBeNull();
	});

	// M4: without knownTracks, mcp-vertex is track-agnostic — any non-empty
	// string is a valid host track, so no vocabulary is imposed.
	it('accepts arbitrary host tracks when no knownTracks set is supplied', () => {
		const raw = wrap(
			'mainWriteLane: my-custom-lane\nparallelismLanes: [whatever, another]\n',
		);
		expect(extractParallelismFromFrontmatter(raw, 'p31')).toEqual({
			proposalId: 'p31',
			mainWriteLane: 'my-custom-lane',
			parallelismLanes: ['whatever', 'another'],
		});
	});

	it('still rejects an empty mainWriteLane even in agnostic mode', () => {
		const raw = wrap('mainWriteLane: ""\nparallelismLanes: [meta]\n');
		expect(extractParallelismFromFrontmatter(raw, 'p31')).toBeNull();
	});

	it('uses the caller-supplied proposalId verbatim, not the one in the frontmatter', () => {
		const raw = wrap('id: p31-frontmatter\nmainWriteLane: editor\n');
		const got = extractParallelismFromFrontmatter(raw, 'p31-caller');
		expect(got?.proposalId).toBe('p31-caller');
	});

	it('accepts all canonical tracks (bootstrap, scaffold, engine, editor, ui-demo, game-demo, meta, audit, audit-meta, retired)', () => {
		for (const t of [
			'bootstrap',
			'scaffold',
			'engine',
			'editor',
			'ui-demo',
			'game-demo',
			'meta',
			'audit',
			'audit-meta',
			'retired',
		]) {
			const got = extractParallelismFromFrontmatter(
				wrap(`mainWriteLane: ${t}\n`),
				'p',
			);
			expect(got?.mainWriteLane).toBe(t);
		}
	});
});
