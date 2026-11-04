/**
 * A unit's generation and its refs in a namespace transition (f00808): a
 * unit entered under a former namespace is still the same unit, and a
 * generation retired under it is still spent.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	ambiguousUnit,
	chooseGeneration,
	endedGenerations,
	existingWorkRef,
	sessionHolding,
	unitGeneration,
} from '@delendai/core/lib/work-units/work-unit-generation.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
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

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const OLD = 'refs/heads/delendai/wip/agent-a/implement/x00001-S1-g1/topic';
const NEW = 'refs/heads/wip/agent-a/implement/x00001-S1-g1/topic';
const ARGS = ['--kind=implement', '--topic=topic'];

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'generation-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

describe('a unit under a former namespace', () => {
	it('is the unit work enter finds again', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(OLD);
	});

	it('leaves a new unit under the current namespace', () => {
		const root = repo();
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
		expect(
			chooseGeneration(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toEqual({ generation: 1 });
	});

	it('keeps a generation retired under the former root spent', () => {
		const root = repo();
		git(
			root,
			'update-ref',
			'refs/delendai/retired/agent-a/implement/x00001-S1-g1/topic',
			'HEAD',
		);
		git(root, 'remote', 'add', 'origin', root);
		expect([...endedGenerations(root, policy, NEW)]).toEqual([1]);
		expect(
			chooseGeneration(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toEqual({ generation: 2 });
	});

	it('is ambiguous when two names answer for one unit', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		git(root, 'update-ref', NEW, 'HEAD');
		expect(
			ambiguousUnit(
				root,
				['--kind=implement'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBeDefined();
		expect(sessionHolding(root, NEW)).toBeUndefined();
	});

	it('reads the generation the arguments name', () => {
		expect(unitGeneration(['--generation=3'])).toBe(3);
		expect(unitGeneration([])).toBe(1);
	});

	it('finds a unit written before its shape named the kind', () => {
		const root = repo();
		const legacy = 'refs/heads/wip/agent-a/x00001-S1-g1/topic';
		git(root, 'update-ref', legacy, 'HEAD');
		expect(
			existingWorkRef(
				root,
				['--topic=topic'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBe(legacy);
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
	});

	it('is not ambiguous for the one ref the arguments render', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		git(root, 'update-ref', OLD, 'HEAD');
		expect(
			ambiguousUnit(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBeUndefined();
		expect(
			chooseGeneration(
				root,
				['--kind=implement', '--generation=1'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual({ generation: 1 });
	});
});
