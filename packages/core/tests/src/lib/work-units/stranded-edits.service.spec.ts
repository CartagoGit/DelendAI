/**
 * stranded-edits.service.spec.ts — edits left in the shared checkout are
 * kept under a ref named for their agent, and the checkout is untouched.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	keepStrandedEdits,
	keepStrandedEditsAtStart,
	listStrandedEdits,
} from '@delendai/core/lib/work-units/stranded-edits.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	).trim();

/** A shared checkout on develop, and agent-a's unit that changed a.ts. */
const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'stranded-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(
		root,
		'switch',
		'-q',
		'-c',
		'delendai/wip/agent-a/implement/x00001-S1-g1/topic',
	);
	writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
	git(root, 'commit', '-q', '-am', 'work');
	git(root, 'switch', '-q', 'develop');
	return root;
};

describe('keepStrandedEdits', () => {
	it("keeps the shared checkout's edits for the agent whose unit covers them, and touches nothing", async () => {
		const root = repo();
		writeFileSync(join(root, 'a.ts'), 'export const a = 3;\n');
		writeFileSync(join(root, 'new.ts'), 'export const b = 1;\n');
		const statusBefore = git(root, 'status', '--porcelain');

		const kept = await keepStrandedEdits({ root, policy });

		expect(kept).toMatchObject({ outcome: 'kept', agent: 'agent-a' });
		if (kept.outcome !== 'kept') throw new Error('not kept');
		expect(kept.ref.startsWith('refs/delendai/stranded/agent-a/')).toBe(
			true,
		);
		expect(git(root, 'show', `${kept.ref}:a.ts`)).toBe(
			'export const a = 3;',
		);
		expect(git(root, 'show', `${kept.ref}:new.ts`)).toBe(
			'export const b = 1;',
		);
		// The checkout, its index and its branch are as they were.
		expect(git(root, 'status', '--porcelain')).toBe(statusBefore);
		expect(git(root, 'diff', '--cached', '--name-only')).toBe('');
		expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe(
			'export const a = 3;\n',
		);
		expect(git(root, 'log', '-1', '--format=%s', 'develop')).toBe('base');

		expect((await keepStrandedEdits({ root, policy })).outcome).toBe(
			'already-kept',
		);
		expect(listStrandedEdits({ root, policy })).toEqual([
			{ ref: kept.ref, agent: 'agent-a' },
		]);
	});

	it('keeps edits no unit covers as unattributed, and reports at start-up', async () => {
		const root = repo();
		writeFileSync(join(root, 'other.ts'), 'export const c = 1;\n');
		const lines: string[] = [];

		const kept = await keepStrandedEditsAtStart(root, policy, (line) =>
			lines.push(line),
		);

		expect(kept).toMatchObject({ outcome: 'kept', agent: 'unattributed' });
		expect(lines.join('')).toContain('To resume:');
	});

	it('does nothing in a clean checkout, nor off the integration branch', async () => {
		const root = repo();
		expect((await keepStrandedEdits({ root, policy })).outcome).toBe(
			'clean',
		);
		git(
			root,
			'switch',
			'-q',
			'delendai/wip/agent-a/implement/x00001-S1-g1/topic',
		);
		writeFileSync(join(root, 'a.ts'), 'export const a = 9;\n');
		expect((await keepStrandedEdits({ root, policy })).outcome).toBe(
			'not-shared-checkout',
		);
	});
});
