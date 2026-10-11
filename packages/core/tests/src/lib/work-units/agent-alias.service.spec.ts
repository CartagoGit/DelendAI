/**
 * agent-alias.service.spec.ts — a re-spelling of an identity already at
 * work is recognised, and a different agent is not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import {
	aliasedIdentity,
	describeAlias,
	describeOffRoster,
} from '@delendai/core/lib/work-units/agent-alias.service';

const known = ['minimax-m3', 'claude-opus-5-5', 'gpt-5.4'];

describe('aliasedIdentity', () => {
	it('recognises the same letters and digits in another case or punctuation', () => {
		for (const spelling of ['MiniMax-M3', 'minimaxm3', 'minimax_m3']) {
			expect(aliasedIdentity(spelling, known)).toBe('minimax-m3');
		}
	});

	it('leaves an identity that is already known, and a different agent, alone', () => {
		expect(aliasedIdentity('minimax-m3', known)).toBeUndefined();
		expect(aliasedIdentity('glm-5.3-flash', known)).toBeUndefined();
		// Another version of the same family is another model.
		expect(aliasedIdentity('claude-opus-5', known)).toBeUndefined();
		expect(aliasedIdentity('gpt-5.5', known)).toBeUndefined();
		// A trailing segment may be a version, so it is never read as a copy.
		expect(
			aliasedIdentity('claude-sonnet-5-5', ['claude-sonnet-5']),
		).toBeUndefined();
		expect(aliasedIdentity('gpt-5-mini', ['gpt-5'])).toBeUndefined();
		expect(aliasedIdentity('anything', [])).toBeUndefined();
	});

	it('names the spelling to use', () => {
		expect(describeAlias('MiniMax-M3', 'minimax-m3')).toContain(
			'--agent=minimax-m3',
		);
	});
});

describe('work enter under a re-spelled identity', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const enter = (root: string, agent: string, slice: string) =>
		runWorkUnit(
			[
				'enter',
				'--proposal=x00001',
				`--slice=${slice}`,
				`--agent=${agent}`,
			],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);

	it('is refused with the spelling already in use, and the known one enters', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-alias-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'work@example.com');
		git('config', 'user.name', 'Work');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		writeFileSync(join(root, '.gitignore'), '.cache/\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'base');

		expect((await enter(root, 'minimax-m3', 'S1')).code).toBe(0);

		const respelled = await enter(root, 'minimaxm3', 'S2');
		expect(respelled.code).not.toBe(0);
		expect(respelled.error).toContain('--agent=minimax-m3');
	});
});

describe('describeOffRoster', () => {
	// What the owner launched on 2026-10-11, and what the agents called
	// themselves: nine names for five models.
	const roster = [
		'minimax-m3.1',
		'gpt-luna-6.0',
		'glm-5.3-flash',
		'gpt-5.4',
		'qwen-3.8-flash',
	];

	it('lets through a name the project gave', () => {
		for (const name of roster) {
			expect(describeOffRoster(name, roster)).toBeUndefined();
		}
	});

	it('refuses every other way a model named itself, pointing at its own names', () => {
		for (const [signed, meant] of [
			['minimax-3.1', 'minimax-m3.1'],
			['minimax-m31', 'minimax-m3.1'],
			['qwen3-flash', 'qwen-3.8-flash'],
			['glm-5.3-max', 'glm-5.3-flash'],
			['glm-4.6-flash', 'glm-5.3-flash'],
		] as const) {
			const told = describeOffRoster(signed, roster);
			expect(told).toContain(
				`\`${signed}\` is not on this project's roster`,
			);
			expect(told).toContain(`sign as that`);
			expect(told).toContain(`\`${meant}\``);
		}
	});

	it('names both when a family has two, and none when it has none', () => {
		expect(describeOffRoster('gpt-5', roster)).toContain(
			'If you are `gpt-luna-6.0` or `gpt-5.4`',
		);
		expect(describeOffRoster('claude-opus-5-5', roster)).not.toContain(
			'sign as that',
		);
	});

	it('holds nobody to a roster the project did not declare', () => {
		expect(describeOffRoster('anything-at-all', [])).toBeUndefined();
	});
});
