/**
 * slice-holders.service.spec.ts — a slice another agent holds is not
 * entered by accident.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import type {
	ISwarmUnit,
	ISwarmView,
} from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	describeSliceHolders,
	holdersOfSlice,
} from '@delendai/core/lib/work-units/slice-holders.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const unit = (agent: string, subject: string, ahead = 1): ISwarmUnit => ({
	ref: `ns/wip/${agent}/${subject}`,
	agent,
	subject,
	tip: subject,
	ahead,
	behind: 0,
	paths: [],
});

const view = (
	units: readonly ISwarmUnit[],
	published: readonly ISwarmUnit[] = [],
): ISwarmView => ({
	integration: 'develop',
	units,
	published,
	publications: published.map((entry) => entry.ref),
	overlaps: [],
	relations: [],
});

const asking = {
	agent: 'me',
	kind: 'implement',
	proposal: 'x00001',
	slice: 'S1',
} as const;

describe('holdersOfSlice', () => {
	it('names another agent on the same slice, live or published', () => {
		const held = holdersOfSlice({
			...asking,
			view: view(
				[unit('codex', 'implement/x00001-S1-g1/t')],
				[unit('glm', 'implement/x00001-S1-g2/t')],
			),
		});
		expect(held.map((entry) => entry.agent)).toEqual(['codex', 'glm']);
	});

	it('counts a unit for the whole proposal against a slice, and a slice against it', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view([unit('codex', 'create/x00001-all-g1/t')]),
			}),
		).toHaveLength(1);
		expect(
			holdersOfSlice({
				...asking,
				slice: 'all',
				view: view([unit('codex', 'implement/x00001-S3-g1/t')]),
			}),
		).toHaveLength(1);
	});

	it('leaves other slices, other proposals, landed publications and odd names alone', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view(
					[
						unit('codex', 'implement/x00001-S2-g1/t'),
						unit('codex', 'implement/x00002-S1-g1/t'),
						unit('codex', 'no-generation'),
					],
					[unit('glm', 'implement/x00001-S1-g1/t', 0)],
				),
			}),
		).toEqual([]);
	});

	it('neither keeps a review out nor lets a review hold a slice', () => {
		const reviewing = view([unit('codex', 'review/x00001-S1-g1/t')]);
		expect(holdersOfSlice({ ...asking, view: reviewing })).toEqual([]);
		expect(
			holdersOfSlice({
				...asking,
				kind: 'review',
				view: view([unit('codex', 'implement/x00001-S1-g1/t')]),
			}),
		).toEqual([]);
	});

	it('lets an agent back into a slice it holds itself', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view([
					unit('me', 'implement/x00001-S1-g1/t'),
					unit('codex', 'implement/x00001-S1-g1/t'),
				]),
			}),
		).toEqual([]);
	});

	it('says who holds it and what can be done about it', () => {
		const lines = describeSliceHolders([
			unit('codex', 'implement/x00001-S1-g1/t'),
		]);
		expect(lines[0]).toContain(
			'codex holds it in ns/wip/codex/implement/x00001-S1-g1/t',
		);
		expect(lines.join('\n')).toContain('--alongside');
		expect(lines.join('\n')).toContain('work claim');
	});
});

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'slice-holders-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'work@example.com');
	git('config', 'user.name', 'Work');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
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
	return root;
};

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<IWorkUnitContext['globals'], 'workspace' | 'json'>(
			{ workspace: root, json: true },
		),
	});

const enter = (root: string, agent: string, extra: readonly string[] = []) =>
	runWorkUnit(
		[
			'enter',
			'--proposal=x00001',
			'--slice=S1',
			`--agent=${agent}`,
			'--topic=probe',
			...extra,
		],
		contextFor(root),
	);

describe('work enter on a slice another agent holds', () => {
	it('refuses the second agent, and lets the first back in', async () => {
		const root = repo();
		const first = await enter(root, 'claude-opus-5');
		expect(first.code).toBe(0);

		const second = await enter(root, 'gpt-5');
		expect(second.code).not.toBe(0);
		expect(second.error).toContain(
			'already being worked on by another agent',
		);

		const session = String((first.data as { session?: unknown }).session);
		const again = await enter(root, 'claude-opus-5', [
			`--session=${session}`,
		]);
		expect(again.error ?? '').toBe('');
		expect(again.code).toBe(0);
	});

	it('lets the second agent in when it says so deliberately', async () => {
		const root = repo();
		await enter(root, 'claude-opus-5');
		expect((await enter(root, 'gpt-5', ['--alongside'])).code).toBe(0);
	});
});
