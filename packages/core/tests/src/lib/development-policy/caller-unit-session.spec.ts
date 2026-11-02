/**
 * caller-unit-session.spec.ts — two instances of one model share its
 * name, and a call names the unit of its own session, not its sibling's.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { callerUnitCheckout } from '@delendai/core/lib/development-policy/project-branches';
import { stampWorktreeAgent } from '@delendai/core/lib/work-units/worktree-agent.service';

describe('callerUnitCheckout with a session', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

	it("skips a unit its sibling's session holds", async () => {
		const top = mkdtempSync(join(tmpdir(), 'caller-unit-'));
		dirs.push(top);
		const root = join(top, 'repo');
		git(top, 'init', '-q', '-b', 'develop', root);
		git(root, 'config', 'user.name', 'spec');
		git(root, 'config', 'user.email', 'spec@example.invalid');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		const unit = join(top, 'unit');
		git(
			root,
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/agent-a/implement/x00001-all-g1/topic',
			unit,
		);
		stampWorktreeAgent(unit, 'agent-a', 's1');

		const asked = (session?: string) =>
			callerUnitCheckout(root, {
				proposal: 'x00001',
				agent: 'agent-a',
				...(session === undefined ? {} : { session }),
			});
		expect((await asked('s1')).status).toBe('found');
		expect((await asked('s2')).status).toBe('none');
		expect((await asked()).status).toBe('found');
	});
});
