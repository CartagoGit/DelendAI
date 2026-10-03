/**
 * proposals-tracked.script.spec.ts — the gate that stops a proposal from
 * living only in someone's working copy.
 *
 * Both pure cores are pinned here: what git's porcelain output means,
 * and what each of the three verdicts is. The verdict that must never be
 * reached by accident is PASS, so the cases that produce it are explicit
 * rather than incidental.
 */
import { describe, expect, it } from 'vitest';

import {
	judgeProposalsTracked,
	parsePorcelain,
} from './proposals-tracked.script';

const STEP = 'land it the way this project declares.';

describe('parsePorcelain', () => {
	it('reads an untracked proposal as untracked', () => {
		expect(
			parsePorcelain(
				'?? docs/delendai/proposals/ready/feats/f00547-x.md',
			),
		).toEqual([
			{
				path: 'docs/delendai/proposals/ready/feats/f00547-x.md',
				reason: 'untracked',
			},
		]);
	});

	it('reads a modified-but-uncommitted proposal as modified', () => {
		expect(
			parsePorcelain(
				' M docs/delendai/proposals/ready/feats/f00500-y.md',
			),
		).toEqual([
			{
				path: 'docs/delendai/proposals/ready/feats/f00500-y.md',
				reason: 'modified',
			},
		]);
	});

	it('counts a staged-but-uncommitted file too — staged is not landed', () => {
		const parsed = parsePorcelain(
			'A  docs/delendai/proposals/ready/feats/f00501-z.md',
		);

		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.reason).toBe('modified');
	});

	it('reads several entries, and ignores blank lines', () => {
		expect(
			parsePorcelain(['?? a/one.md', '', ' M a/two.md', ''].join('\n')),
		).toEqual([
			{ path: 'a/one.md', reason: 'untracked' },
			{ path: 'a/two.md', reason: 'modified' },
		]);
	});

	it('unquotes a path git decided to quote', () => {
		expect(parsePorcelain('?? "a/spaced name.md"')).toEqual([
			{ path: 'a/spaced name.md', reason: 'untracked' },
		]);
	});

	it('finds nothing in a clean tree', () => {
		expect(parsePorcelain('')).toEqual([]);
	});
});

describe('judgeProposalsTracked', () => {
	it('passes when every proposal is committed', () => {
		const report = judgeProposalsTracked({
			hasProposalsDir: true,
			unlanded: [],
			integrationStep: STEP,
		});

		expect(report.verdict).toBe('PASS');
		expect(report.unlanded).toEqual([]);
	});

	it('is not applicable to a workspace with no proposals directory', () => {
		const report = judgeProposalsTracked({
			hasProposalsDir: false,
			unlanded: [],
			integrationStep: STEP,
		});

		// A host that does not use the plugin is not in violation of
		// anything, and must not be failed for it.
		expect(report.verdict).toBe('NOT_APPLICABLE');
	});

	it('fails, naming every file and the project’s own landing step', () => {
		const report = judgeProposalsTracked({
			hasProposalsDir: true,
			unlanded: [
				{ path: 'docs/p/f00547-a.md', reason: 'untracked' },
				{ path: 'docs/p/f00548-b.md', reason: 'untracked' },
			],
			integrationStep: STEP,
		});

		expect(report.verdict).toBe('FAIL');
		expect(report.message).toContain('f00547-a.md');
		expect(report.message).toContain('f00548-b.md');
		expect(report.message).toContain(STEP);
	});

	it('never suggests deleting the work', () => {
		const report = judgeProposalsTracked({
			hasProposalsDir: true,
			unlanded: [{ path: 'docs/p/f00547-a.md', reason: 'untracked' }],
			integrationStep: STEP,
		});

		// The first incident this gate exists for was nearly "resolved"
		// by deleting another agent's proposals. The message says the
		// opposite, in as many words.
		expect(report.message).toContain('Never resolve this by deleting');
	});

	it('does not name a mechanism the project did not declare', () => {
		const report = judgeProposalsTracked({
			hasProposalsDir: true,
			unlanded: [{ path: 'docs/p/f00547-a.md', reason: 'untracked' }],
			integrationStep: 'merge it into trunk yourself.',
		});

		// Workflow-agnostic: a project that merges directly must not be
		// told to open a pull request.
		expect(report.message).not.toContain('pull request');
		expect(report.message).toContain('merge it into trunk yourself.');
	});
});
