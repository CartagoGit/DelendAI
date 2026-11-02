/**
 * tools.spec.ts — the read-only git orientation tools answer through the
 * injected runner, say so when the tree is not a repository, and refuse
 * a ref that git would read as an option.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import type { IGitRunner } from '../../../src/lib/services/git';
import { buildGitToolRegistrations } from '../../../src/lib/tools/tools';

type Handler = (args: unknown) => unknown;

const SHOW_OUTPUT = 'abc\u001fAda\u001f2026-01-01\u001fsubject\n a.ts | 1 +';

const repoRunner =
	(
		extra: (args: readonly string[]) => string | undefined = () =>
			undefined,
	): IGitRunner =>
	async (args) => {
		if (args[0] === 'rev-parse') return { ok: true, output: 'true\n' };
		const output = extra(args);
		return output === undefined
			? { ok: true, output: '' }
			: { ok: true, output };
	};

const handlers = async (
	run: IGitRunner,
): Promise<ReadonlyMap<string, Handler>> => {
	const found = new Map<string, Handler>();
	const server = createFakeToolServer({
		onRegisterTool: (tool) => {
			found.set(tool.name, tool.handler);
		},
	});
	for (const reg of buildGitToolRegistrations({
		namespacePrefix: 'git',
		run,
	}))
		await reg.register(server);
	return found;
};

const INPUTS: Readonly<Record<string, unknown>> = {
	git_status: {},
	git_changed: {},
	git_diff: { staged: true, path: 'a.ts' },
	git_log: { limit: 500 },
	git_blame: { path: 'a.ts', startLine: 1, endLine: 2 },
	git_show: { ref: 'HEAD', path: 'a.ts' },
	git_worktree: {},
	git_changelog: { range: 'v1..HEAD', limit: 5 },
};

const textOf = (result: unknown): string => JSON.stringify(result);

describe('git orientation tools', () => {
	it('registers the eight read-only tools', async () => {
		expect([...(await handlers(repoRunner())).keys()].sort()).toEqual(
			Object.keys(INPUTS).sort(),
		);
	});

	it.each(Object.keys(INPUTS))(
		'%s says so outside a repository',
		async (name) => {
			const all = await handlers(async () => ({
				ok: false,
				output: '',
				reason: 'fatal: not a git repository',
			}));
			expect(textOf(await all.get(name)?.(INPUTS[name]))).toContain(
				'not a git repository',
			);
		},
	);

	it('says git is missing when it is not installed', async () => {
		const all = await handlers(async () => ({
			ok: false,
			output: '',
			reason: 'git is not installed',
		}));
		expect(textOf(await all.get('git_status')?.({}))).toContain(
			'git is not available here',
		);
	});

	it('answers each tool from the runner inside a repository', async () => {
		const all = await handlers(
			repoRunner((args) => {
				if (args[0] === 'status') return '## main\n M a.ts';
				if (args[0] === 'diff') return ' a.ts | 1 +';
				if (args[0] === 'log') return 'abc\tfeat: x';
				if (args[0] === 'show') return SHOW_OUTPUT;
				return undefined;
			}),
		);
		for (const name of Object.keys(INPUTS)) {
			const text = textOf(await all.get(name)?.(INPUTS[name]));
			expect(text, name).not.toContain('not a git repository');
		}
		expect(textOf(await all.get('git_status')?.({}))).toContain('a.ts');
		expect(textOf(await all.get('git_log')?.({}))).toContain('feat: x');
	});

	it('reports a failed blame and a failed show as tool errors', async () => {
		const failing: IGitRunner = async (args) =>
			args[0] === 'rev-parse'
				? { ok: true, output: 'true' }
				: { ok: false, output: '', reason: `${args[0]} failed` };
		const all = await handlers(failing);
		expect(textOf(await all.get('git_blame')?.({ path: 'x' }))).toContain(
			'blame failed',
		);
		expect(textOf(await all.get('git_show')?.({}))).toContain(
			'show failed',
		);
	});
});
