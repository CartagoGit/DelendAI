import { describe, expect, it } from 'vitest';

import {
	checkRepo,
	gitBlame,
	gitChanged,
	gitLog,
	gitShow,
	gitStatus,
	gitWorktreeList,
	parseBlamePorcelain,
	parseLog,
	parseShowOutput,
	parseStatus,
	parseWorktreeList,
} from '@mcp-vertex/git/lib/services/git';
import type { IGitRunner } from '@mcp-vertex/git/lib/services/git';
import plugin from '@mcp-vertex/git';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

describe('git parsers', async () => {
	it('parses porcelain status with branch', async () => {
		const status = parseStatus(
			'## main...origin/main\n M src/a.ts\n?? src/b.ts',
		);
		expect(status.branch).toBe('main');
		expect(status.clean).toBe(false);
		expect(status.entries).toEqual([
			{ status: 'M', path: 'src/a.ts' },
			{ status: '??', path: 'src/b.ts' },
		]);
	});

	it('treats no entries as clean', async () => {
		expect(parseStatus('## main').clean).toBe(true);
	});

	it('parses log lines', async () => {
		expect(parseLog('abc123\tfeat: x\ndef456\tfix: y')).toEqual([
			{ hash: 'abc123', subject: 'feat: x' },
			{ hash: 'def456', subject: 'fix: y' },
		]);
	});

	it('threads an injected runner through the helpers', async () => {
		const run: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## dev\n M f.ts' };
			if (args[0] === 'log') return { ok: true, output: 'h1\ts1' };
			return { ok: true, output: '' };
		};
		expect((await gitStatus(run)).branch).toBe('dev');
		expect(await gitChanged(run)).toEqual(['f.ts']);
		expect((await gitLog(run, 5))[0]?.subject).toBe('s1');
	});

	it('distinguishes git-unavailable from not-a-repo (structured result)', async () => {
		const missing: IGitRunner = async () => ({
			ok: false,
			output: '',
			reason: 'git is not installed or not on PATH',
		});
		expect((await checkRepo(missing)).reason).toBe(
			'git is not available here',
		);

		const notRepo: IGitRunner = async () => ({
			ok: false,
			output: '',
			reason: 'fatal: not a git repository (or any of the parent directories): .git',
		});
		expect((await checkRepo(notRepo)).reason).toBe('not a git repository');

		const clean: IGitRunner = async () => ({ ok: true, output: 'true\n' });
		expect(await checkRepo(clean)).toEqual({ ok: true });
	});
});

describe('git blame (M33)', async () => {
	const PORCELAIN = [
		'abcdefabcdefabcdefabcdefabcdefabcdefabcd 1 1 2',
		'author Jane Doe',
		'author-mail <jane@example.com>',
		'author-time 1700000000',
		'author-tz +0000',
		'summary Initial commit',
		'filename src/a.ts',
		'\tconst x = 1;',
		'abcdefabcdefabcdefabcdefabcdefabcdefabcd 2 2',
		'\tconst y = 2;',
	].join('\n');

	it('parses a full block then reuses cached metadata for the abbreviated repeat', async () => {
		const lines = parseBlamePorcelain(PORCELAIN);
		expect(lines).toEqual([
			{
				line: 1,
				hash: 'abcdefabcdef',
				author: 'Jane Doe',
				date: '2023-11-14',
				content: 'const x = 1;',
			},
			{
				line: 2,
				hash: 'abcdefabcdef',
				author: 'Jane Doe',
				date: '2023-11-14',
				content: 'const y = 2;',
			},
		]);
	});

	it('threads an injected runner and surfaces failures with a reason', async () => {
		const run: IGitRunner = async () => ({ ok: true, output: PORCELAIN });
		const ok = await gitBlame(run, 'src/a.ts');
		expect(ok.ok).toBe(true);
		expect(ok.lines).toHaveLength(2);

		const failing: IGitRunner = async () => ({
			ok: false,
			output: '',
			reason: 'fatal: no such path',
		});
		const failed = await gitBlame(failing, 'missing.ts');
		expect(failed).toEqual({
			ok: false,
			lines: [],
			reason: 'fatal: no such path',
		});
	});

	it('rejects a half-open line range before calling git', async () => {
		const run: IGitRunner = async () => {
			throw new Error('runner should not be called');
		};
		await expect(
			gitBlame(run, 'src/a.ts', { startLine: 3 }),
		).resolves.toEqual({
			ok: false,
			lines: [],
			reason: 'startLine and endLine must be provided together',
		});
	});
});

describe('git show (M33)', async () => {
	it('parses real git show output where --stat starts immediately after the subject', async () => {
		expect(
			parseShowOutput(
				[
					'abc1234',
					'Jane Doe',
					'2024-01-02T03:04:05+00:00',
					'feat: add thing',
					' src/a.ts | 2 ++',
					' 1 file changed, 2 insertions(+)',
				].join('\n'),
			),
		).toEqual({
			hash: 'abc1234',
			author: 'Jane Doe',
			date: '2024-01-02T03:04:05+00:00',
			subject: 'feat: add thing',
			stat: 'src/a.ts | 2 ++\n 1 file changed, 2 insertions(+)',
		});
	});

	it('parses commit metadata + the --stat summary below an optional blank line', async () => {
		const run: IGitRunner = async () => ({
			ok: true,
			output: [
				'abc1234',
				'Jane Doe',
				'2024-01-02T03:04:05+00:00',
				'feat: add thing',
				'',
				' src/a.ts | 2 ++',
				' 1 file changed, 2 insertions(+)',
			].join('\n'),
		});
		const result = await gitShow(run, 'HEAD');
		expect(result).toEqual({
			ok: true,
			detail: {
				hash: 'abc1234',
				author: 'Jane Doe',
				date: '2024-01-02T03:04:05+00:00',
				subject: 'feat: add thing',
				stat: 'src/a.ts | 2 ++\n 1 file changed, 2 insertions(+)',
			},
		});
	});

	it('surfaces a reason when the ref does not resolve', async () => {
		const run: IGitRunner = async () => ({
			ok: false,
			output: '',
			reason: "fatal: bad revision 'nope'",
		});
		expect(await gitShow(run, 'nope')).toEqual({
			ok: false,
			reason: "fatal: bad revision 'nope'",
		});
	});
});

describe('git worktree list (M33)', async () => {
	const PORCELAIN = [
		'worktree /home/user/repo',
		'HEAD abc123abc123abc123abc123abc123abc123abc1',
		'branch refs/heads/main',
		'',
		'worktree /home/user/repo-agent-a1',
		'HEAD def456def456def456def456def456def456def4',
		'branch refs/heads/agent/a1',
		'',
		'worktree /home/user/repo-bare',
		'HEAD 0000000000000000000000000000000000000000',
		'bare',
	].join('\n');

	it('parses multiple worktree blocks, resolving branch refs and flags', async () => {
		expect(parseWorktreeList(PORCELAIN)).toEqual([
			{
				path: '/home/user/repo',
				head: 'abc123abc123abc123abc123abc123abc123abc1',
				branch: 'main',
			},
			{
				path: '/home/user/repo-agent-a1',
				head: 'def456def456def456def456def456def456def4',
				branch: 'agent/a1',
			},
			{
				path: '/home/user/repo-bare',
				head: '0000000000000000000000000000000000000000',
				bare: true,
			},
		]);
	});

	it('threads an injected runner', async () => {
		const run: IGitRunner = async (args) => {
			expect(args).toEqual(['worktree', 'list', '--porcelain']);
			return { ok: true, output: PORCELAIN };
		};
		expect(await gitWorktreeList(run)).toHaveLength(3);
	});
});

describe('git plugin', async () => {
	it('registers the read-only git tools + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/git',
			pluginDocsDir: 'docs/mcp-vertex/git',
			namespacePrefix: 'git',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		// ids are bare verbs; registered MCP names are `git_status` etc.
		// (prefix + id), avoiding the old double-prefix `git_git_status`.
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'status',
			'changed',
			'diff',
			'log',
			'blame',
			'show',
			'worktree',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('git-orientation');
	});
});
