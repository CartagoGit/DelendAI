/**
 * transition-untracked-file.spec.ts — x00106 S2.
 *
 * `proposal_transition` used to emit a scary "blame history for this
 * file was not preserved by git" warning for every FRESHLY CREATED
 * proposal, because `create_proposal` never stages its output so the
 * first `git mv` fails on an untracked file — which has no history to
 * lose. Untracked files now move via plain rename + `git add` (no
 * warning); tracked files still use `git mv` and only warn when git mv
 * genuinely fails.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import { buildProposalTransitionRegistration } from '@delendai/proposals/lib/tools/proposal-transition.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

const PROPOSAL_MD = (id: string, status: string): string =>
	[
		'---',
		`id: ${id}`,
		`status: ${status}`,
		'type: proposal',
		'track: general',
		'kind: feat',
		'---',
		'',
		`# ${id} — fixture`,
		'',
		'## Goal',
		'',
		'Fixture proposal for the untracked-transition spec.',
		'',
	].join('\n');

describe('proposal_transition on fresh vs tracked files (x00106 S2)', () => {
	let root = '';
	let proposalsDirAbs = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'transition-untracked-'));
		git(root, 'init', '-b', 'main');
		git(root, 'config', 'user.email', 'spec@example.com');
		git(root, 'config', 'user.name', 'spec');
		proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		for (const folder of ['ready', 'in-progress']) {
			mkdirSync(join(proposalsDirAbs, folder), { recursive: true });
		}
		// A seed commit so HEAD exists and `git mv` has a real index.
		writeFileSync(join(root, 'README.md'), '# fixture\n');
		git(root, 'add', 'README.md');
		git(root, 'commit', '-m', 'seed');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const transitionTool = async () =>
		capture(
			buildProposalTransitionRegistration({
				namespacePrefix: 'proposals',
				proposalsDirAbs,
				workspaceRoot: root,
			}),
		);

	it('an UNTRACKED (just-created) proposal moves with NO history warning and gets staged', async () => {
		writeFileSync(
			join(proposalsDirAbs, 'ready/f00001-fresh.md'),
			PROPOSAL_MD('f00001', 'ready'),
		);
		const transition = await transitionTool();
		const result = parse(
			await transition({
				id: 'f00001',
				to: 'in-progress',
				reason: 'spec',
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.warning).toBeUndefined();
		// The new location is staged so the NEXT transition can git mv.
		const staged = git(root, 'status', '--porcelain');
		expect(staged).toContain('in-progress/f00001-fresh.md');
		expect(staged).toContain('A ');
	});

	it('a TRACKED proposal still moves via git mv (rename detected, no warning)', async () => {
		const readyPath = join(proposalsDirAbs, 'ready/f00002-tracked.md');
		writeFileSync(readyPath, PROPOSAL_MD('f00002', 'ready'));
		git(root, 'add', '.');
		git(root, 'commit', '-m', 'add proposal');
		const transition = await transitionTool();
		const result = parse(
			await transition({
				id: 'f00002',
				to: 'in-progress',
				reason: 'spec',
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.warning).toBeUndefined();
		const staged = git(root, 'status', '--porcelain');
		// git mv stages a rename (R) — not an add of an unrelated file.
		expect(staged).toContain('in-progress/f00002-tracked.md');
	});

	it('still warns when git itself is unavailable for a TRACKED-style failure', async () => {
		writeFileSync(
			join(proposalsDirAbs, 'ready/f00003-nogit.md'),
			PROPOSAL_MD('f00003', 'ready'),
		);
		git(root, 'add', '.');
		git(root, 'commit', '-m', 'add proposal');
		const transition = await capture(
			buildProposalTransitionRegistration({
				namespacePrefix: 'proposals',
				proposalsDirAbs,
				workspaceRoot: root,
				// A runner that fails every WRITE verb but answers the
				// tracked-check truthfully: ls-files succeeds.
				gitRunner: async (args) =>
					args[0] === 'ls-files'
						? { ok: true, output: '' }
						: {
								ok: false,
								output: '',
								reason: 'git unavailable',
							},
			}),
		);
		const result = parse(
			await transition({
				id: 'f00003',
				to: 'in-progress',
				reason: 'spec',
			}),
		);
		expect(result.ok).toBe(true);
		expect(String(result.warning)).toContain('git mv failed');
	});

	it('rewrites self **Files** paths and syncs the index (a00069 S3)', async () => {
		mkdirSync(join(proposalsDirAbs, 'done/feats'), { recursive: true });
		const indexPath = join(root, '.cache/proposals/index.json');
		mkdirSync(join(root, '.cache/proposals'), { recursive: true });
		writeFileSync(
			indexPath,
			JSON.stringify({
				proposals: [
					{
						id: 'f00004',
						file: 'review/f00004-self.md',
						status: 'review',
					},
				],
			}),
		);
		const body = [
			'---',
			'id: f00004',
			'status: review',
			'type: proposal',
			'track: general',
			'kind: feat',
			'shipped-in: [30551533]',
			'---',
			'',
			'# f00004',
			'',
			'## Slices',
			'',
			'### S1 — track self',
			'',
			'- **Files**: `review/f00004-self.md`',
			'',
		].join('\n');
		mkdirSync(join(proposalsDirAbs, 'review'), { recursive: true });
		writeFileSync(join(proposalsDirAbs, 'review/f00004-self.md'), body);
		git(root, 'add', '.');
		git(root, 'commit', '-m', 'add self-ref proposal');
		const transition = await capture(
			buildProposalTransitionRegistration({
				namespacePrefix: 'proposals',
				proposalsDirAbs,
				workspaceRoot: root,
				indexPathAbs: indexPath,
			}),
		);
		const result = parse(
			await transition({
				id: 'f00004',
				to: 'done',
				reason: 'a00069 S3 close',
				// a00069 S7: this fixture has no peer-review log; force the DFA move.
				force: true,
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.filesRewritten).toBe(1);
		expect(result.indexSynced).toBe(true);
		expect(result.movedTo).toBe('done/feats/f00004-self.md');
		expect(existsSync(join(proposalsDirAbs, 'done/feats/.gitkeep'))).toBe(
			true,
		);
		const moved = readFileSync(
			join(proposalsDirAbs, 'done/feats/f00004-self.md'),
			'utf8',
		);
		expect(moved).toContain('status: done');
		expect(moved).toContain('done/feats/f00004-self.md');
		expect(moved).not.toContain('review/f00004-self.md');
		const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
			proposals: Array<{ id: string; file: string }>;
		};
		const entry = index.proposals.find((p) => p.id === 'f00004');
		expect(entry?.file).toBe('done/feats/f00004-self.md');
	});
});
