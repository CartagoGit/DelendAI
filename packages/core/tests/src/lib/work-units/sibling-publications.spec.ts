/**
 * sibling-publications.spec.ts — a unit does not publish around another
 * open publication of itself (x01032). Real repository, real bare remote.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { publishWorkUnit } from '@delendai/core/lib/work-units/work-publish.service';
import { siblingRefs } from '@delendai/core/lib/work-units/sibling-publications.service';

const roots: string[] = [];
const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const WIP = 'refs/heads/delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work';
const PACK = 'delendai/pr/gpt-5.3-codex/review/batch-all-g1/verdicts';
const NEW = 'refs/heads/delendai/pr/gpt-5.3-codex/implement/batch-all-g1/work';

/** develop at `base`, the pack on the remote one commit ahead of it. */
const repo = (): { root: string; base: string; pack: string } => {
	const root = mkdtempSync(join(tmpdir(), 'sibling-'));
	const remote = mkdtempSync(join(tmpdir(), 'sibling-remote-'));
	roots.push(root, remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'a@example.com');
	git(root, 'config', 'user.name', 'A');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'f'), '0');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	const base = git(root, 'rev-parse', 'HEAD');
	git(root, 'switch', '-q', '-c', 'pack');
	writeFileSync(join(root, 'f'), 'verdict');
	git(root, 'commit', '-q', '-am', 'verdict');
	const pack = git(root, 'rev-parse', 'HEAD');
	git(root, 'push', '-q', 'origin', `pack:refs/heads/${PACK}`);
	git(root, 'switch', '-q', 'develop');
	git(root, 'branch', '-q', '-D', 'pack');
	return { root, base, pack };
};

const publish = (root: string) =>
	publishWorkUnit({
		root,
		cwd: root,
		workRef: WIP,
		publicationRef: NEW,
		remote: 'origin',
		keepWorkRef: true,
	});

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('siblingRefs', () => {
	it('names the other publications of the same agent and unit, whatever the kind', () => {
		expect(
			siblingRefs(NEW.replace('refs/heads/', ''), [
				PACK,
				'delendai/pr/other/review/batch-all-g1/verdicts',
				'delendai/pr/gpt-5.3-codex/review/batch-all-g2/verdicts',
			]),
		).toEqual([PACK]);
	});
});

describe('publishing a unit with another open publication', () => {
	it('refuses while the other holds commits the unit lacks, naming the merge', () => {
		const { root, base } = repo();
		writeFileSync(join(root, 'g'), 'claim');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'claim');
		git(root, 'update-ref', WIP, 'HEAD');
		git(root, 'reset', '-q', '--hard', base);

		const outcome = publish(root);

		expect(outcome.published).toBe(false);
		const refusal = outcome.steps.find(
			(step) => step.name === 'sibling-publication',
		);
		expect(refusal?.ok).toBe(false);
		expect(refusal?.detail).toContain(`git merge origin/${PACK}`);
		expect(git(root, 'ls-remote', 'origin', NEW)).toBe('');
	});

	it('retires the other when the new publication contains it completely, keeping its tip', () => {
		const { root, pack } = repo();
		git(root, 'fetch', '-q', 'origin');
		git(root, 'update-ref', WIP, `refs/remotes/origin/${PACK}`);
		git(root, 'switch', '-q', '--detach', WIP);
		writeFileSync(join(root, 'g'), 'claim');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'claim');
		git(root, 'update-ref', WIP, 'HEAD');
		git(root, 'switch', '-q', 'develop');

		const outcome = publish(root);

		expect(outcome.published).toBe(true);
		const retired = outcome.steps.find(
			(step) => step.name === 'retire-sibling',
		);
		expect(retired?.ok).toBe(true);
		expect(git(root, 'ls-remote', 'origin', `refs/heads/${PACK}`)).toBe('');
		expect(
			git(
				root,
				'rev-parse',
				'delendai/retired/gpt-5.3-codex/review/batch-all-g1/verdicts',
			),
		).toBe(pack);
	});
});
