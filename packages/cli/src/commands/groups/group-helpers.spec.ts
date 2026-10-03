/**
 * group-helpers.spec.ts — who a CLI call works as: the flag, the
 * environment, then the unit the working tree is on.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { agentOfWorkBranch, resolveAgent } from './group-helpers';

const TEMPLATE =
	'heads/delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}';

describe('agentOfWorkBranch', () => {
	it('reads the agent segment of a work ref with the template that wrote it', () => {
		expect(
			agentOfWorkBranch(
				TEMPLATE,
				'delendai/wip/claude-sonnet-5-5/implement/x00811-S1-g2/the-topic',
			),
		).toBe('claude-sonnet-5-5');
	});

	it('reads nothing from a branch that is not a work ref, or from no template', () => {
		expect(agentOfWorkBranch(TEMPLATE, 'develop')).toBeUndefined();
		expect(
			agentOfWorkBranch('', 'delendai/wip/a/implement/x1-S1-g1/t'),
		).toBeUndefined();
		expect(agentOfWorkBranch(undefined, 'develop')).toBeUndefined();
	});
});

describe('resolveAgent', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const unitCheckout = (branch: string): string => {
		const root = mkdtempSync(join(tmpdir(), 'resolve-agent-'));
		roots.push(root);
		const git = (...args: string[]): void => {
			execFileSync('git', args, { cwd: root, stdio: 'ignore' });
		};
		git('init', '-q', '-b', branch);
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({ development: { profile: 'shared-checkout-pr' } }),
		);
		return root;
	};

	const UNIT = 'wip/claude-opus-5-5/implement/x00811-S1-g1/topic';

	it('takes the agent from the unit when nothing else names one', async () => {
		const root = unitCheckout(UNIT);
		expect(await resolveAgent([], root, {})).toBe('claude-opus-5-5');
	});

	it('prefers the flag, then the environment, over the unit', async () => {
		const root = unitCheckout(UNIT);
		expect(await resolveAgent(['--agent=Flag-One'], root, {})).toBe(
			'flag-one',
		);
		expect(
			await resolveAgent([], root, { DELENDAI_AGENT_ID: 'env-two' }),
		).toBe('env-two');
	});

	it('names nobody on a branch that is not a unit', async () => {
		const root = unitCheckout('develop');
		expect(await resolveAgent([], root, {})).toBeUndefined();
	});
});
