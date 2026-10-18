/**
 * work-ref-lifecycle.service.spec.ts — one table for a work ref's life,
 * and the readings every caller feeds it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import type {
	IWorkRefFacts,
	WorkRefFate,
} from '@delendai/core/lib/contracts/interfaces/work-ref-lifecycle.interface';
import {
	landedForgeRefKept,
	workRefFate,
	workRefOpenness,
	workRefProposalOpen,
} from '@delendai/core/lib/work-units/work-ref-lifecycle.service';

const facts = (over: Partial<IWorkRefFacts>): IWorkRefFacts => ({
	landed: false,
	onForge: true,
	openAtTip: false,
	openOnIntegration: false,
	worktree: 'none',
	...over,
});

describe('workRefFate', () => {
	const table: readonly [string, Partial<IWorkRefFacts>, WorkRefFate][] = [
		[
			'open on the integration branch, on the forge',
			{ landed: true, openOnIntegration: true },
			'keep',
		],
		[
			'open on the integration branch, lost from the forge',
			{ landed: true, onForge: false, openOnIntegration: true },
			'restore',
		],
		[
			'open at its own unlanded tip, lost from the forge',
			{ onForge: false, openAtTip: true },
			'restore',
		],
		[
			'open at a landed tip only: history',
			{ landed: true, openAtTip: true },
			'reap',
		],
		['holding work the integration branch lacks', {}, 'keep'],
		['not on the forge, with work of its own', { onForge: false }, 'keep'],
		[
			'landed and closed, a checkout in use',
			{ landed: true, worktree: 'in-use' },
			'withdraw',
		],
		[
			'landed and closed, a clean worktree',
			{ landed: true, worktree: 'clean' },
			'reap',
		],
		['landed and closed, no worktree', { landed: true }, 'reap'],
	];
	it.each(table)('%s', (_name, over, fate) => {
		const verdict = workRefFate(facts(over));
		expect(verdict.fate).toBe(fate);
		expect(verdict.reason.length).toBeGreaterThan(0);
	});

	it('reads a landed ref by the integration branch alone', () => {
		expect(
			workRefProposalOpen({
				landed: true,
				openAtTip: true,
				openOnIntegration: false,
			}),
		).toBe(false);
		expect(
			workRefProposalOpen({
				landed: false,
				openAtTip: true,
				openOnIntegration: false,
			}),
		).toBe(true);
	});
});

describe('reading a clone', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});
	const ref = 'delendai/wip/glm-5.3-flash/implement/x00001-all-g1/thing';

	/** A clone whose `refs/remotes/origin/*` stand where a fetch put them. */
	const clone = (
		folderOnIntegration: string,
		folderAtTip: string,
	): string => {
		const root = mkdtempSync(join(tmpdir(), 'work-ref-lifecycle-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		git(root, 'config', 'user.email', 'p@example.com');
		git(root, 'config', 'user.name', 'P');
		git(root, 'config', 'commit.gpgsign', 'false');
		const place = (folder: string): void => {
			git(root, 'rm', '-q', '-r', '--ignore-unmatch', 'docs');
			mkdirSync(join(root, `docs/delendai/proposals/${folder}`), {
				recursive: true,
			});
			writeFileSync(
				join(root, `docs/delendai/proposals/${folder}/x00001-thing.md`),
				'---\nid: x00001\n---\n',
			);
			git(root, 'add', '-A');
			git(root, 'commit', '-q', '--allow-empty', '-m', `docs: ${folder}`);
		};
		place(folderAtTip);
		git(root, 'update-ref', `refs/remotes/origin/${ref}`, 'HEAD');
		place(folderOnIntegration);
		git(root, 'update-ref', 'refs/remotes/origin/develop', 'HEAD');
		return root;
	};

	it('takes both readings of the proposal', () => {
		const root = clone('ready/fixes', 'in-progress');
		expect(
			workRefOpenness(
				root,
				'x00001',
				`refs/remotes/origin/${ref}`,
				'refs/remotes/origin/develop',
			),
		).toEqual({ openAtTip: true, openOnIntegration: false });
	});

	it('keeps a landed forge ref while the integration branch holds its proposal in progress', () => {
		expect(
			landedForgeRefKept(
				clone('in-progress', 'ready/fixes'),
				policy,
				'origin',
				'develop',
				ref,
			),
		).toBe(true);
	});

	it('lets a landed forge ref go once the integration branch moved its proposal on', () => {
		expect(
			landedForgeRefKept(
				clone('review', 'in-progress'),
				policy,
				'origin',
				'develop',
				ref,
			),
		).toBe(false);
	});

	it('lets a ref that names no unit go', () => {
		expect(
			landedForgeRefKept(
				clone('in-progress', 'in-progress'),
				policy,
				'origin',
				'develop',
				'feature/x',
			),
		).toBe(false);
	});
});
