import { describe, expect, it } from 'vitest';

import {
	checkRepo,
	gitChanged,
	gitLog,
	gitStatus,
	parseLog,
	parseStatus,
} from '@mcp-vertex/git/lib/git';
import type { IGitRunner } from '@mcp-vertex/git/lib/git';
import plugin from '@mcp-vertex/git';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

describe('git parsers', () => {
	it('parses porcelain status with branch', () => {
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

	it('treats no entries as clean', () => {
		expect(parseStatus('## main').clean).toBe(true);
	});

	it('parses log lines', () => {
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

describe('git plugin', () => {
	it('registers the read-only git tools + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
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
		]);
		expect(reg.knowledge?.[0]?.id).toBe('git-orientation');
	});
});
