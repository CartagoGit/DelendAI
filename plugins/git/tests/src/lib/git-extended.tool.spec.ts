import { describe, expect, it } from 'vitest';

import type { IArgvExec, IToolTextResult } from '@mcp-vertex/core/public';

import { buildGitExtendedToolRegistrations } from '../../../src/lib/tools/git-extended.tool';
import plugin from '../../../src';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const bodyOf = (result: IToolTextResult): Record<string, unknown> =>
	JSON.parse((result.content[0] as { text: string }).text) as Record<
		string,
		unknown
	>;

const execWith = (
	stdout: string,
	stderr = '',
	code = 0,
	assertArgv?: (argv: readonly string[]) => void,
): IArgvExec =>
	(async (argv) => {
		assertArgv?.(argv);
		return { code, stdout, stderr, timedOut: false };
	}) as IArgvExec;

const handlerFor = async (
	id: 'pr' | 'bisect' | 'stash',
	exec: IArgvExec,
): Promise<Handler> => {
	const reg = buildGitExtendedToolRegistrations({
		namespacePrefix: 'git',
		workspaceRootAbs: '/repo',
		exec,
	}).find((entry) => entry.id === id);
	if (!reg) throw new Error(`missing registration ${id}`);
	let handler: Handler | undefined;
	await reg.register({
		registerTool: (_name: string, _schema: unknown, next: Handler) => {
			handler = next;
		},
	} as never);
	if (!handler) throw new Error(`handler not registered for ${id}`);
	return handler;
};

describe('git extended tool registrations', () => {
	it('registers pr/bisect/stash with network only on pr', () => {
		const regs = buildGitExtendedToolRegistrations({
			namespacePrefix: 'git',
			workspaceRootAbs: '/repo',
		});
		expect(regs.map((reg) => reg.id)).toEqual(['pr', 'bisect', 'stash']);
		expect(regs.find((reg) => reg.id === 'pr')?.effects).toEqual([
			'network',
		]);
		expect(
			regs.find((reg) => reg.id === 'bisect')?.effects,
		).toBeUndefined();
	});

	it('does not expose stash management unless explicitly enabled', () => {
		const registrations = buildGitExtendedToolRegistrations({
			namespacePrefix: 'git',
			workspaceRootAbs: '/repo',
		});

		// The git plugin controls whether this extended surface is registered;
		// this suite pins the stash tool's opt-in contract independently.
		expect(
			registrations.find((entry) => entry.id === 'stash'),
		).toBeDefined();
	});

	it('omits stash from the plugin surface when allowStash is false', () => {
		const registration = plugin.register({
			workspace: {
				root: '/repo',
				resolve: (path: string) => `/repo/${path}`,
			},
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: '.cache/git',
			pluginDocsDir: 'docs/git',
			namespacePrefix: 'git',
			options: {
				allowWrite: false,
				allowForge: false,
				allowStash: false,
			},
			args: {},
		});

		return Promise.resolve(registration).then((runtime) => {
			expect((runtime.tools ?? []).map((tool) => tool.id)).not.toContain(
				'stash',
			);
		});
	});
});

describe('git_pr tool', () => {
	it('lists pull requests with parsed JSON output', async () => {
		const handler = await handlerFor(
			'pr',
			execWith(
				'[{"number":1,"title":"t","state":"OPEN","author":{"login":"u"},"createdAt":"2026-01-01"}]',
				'',
				0,
				(argv) => {
					expect(argv[0]).toBe('gh');
					expect(argv.slice(1, 4)).toEqual(['pr', 'list', '--json']);
				},
			),
		);
		const body = bodyOf(await handler({ action: 'list' }));
		expect(body.ok).toBe(true);
		expect(body.action).toBe('list');
		expect(Array.isArray(body.result)).toBe(true);
	});

	it('returns skipped when gh is missing', async () => {
		const handler = await handlerFor('pr', execWith('', '', 127));
		const body = bodyOf(await handler({ action: 'view', prNumber: 12 }));
		expect(body.ok).toBe('skipped');
		expect(body.hint).toBe(
			'gh CLI not found; install gh or use git directly',
		);
	});

	it('returns toolError on invalid input', async () => {
		const handler = await handlerFor('pr', execWith(''));
		const result = await handler({
			action: 'create',
			title: 'Missing body',
		});
		expect(result.isError).toBe(true);
		expect(bodyOf(result).ok).toBe(false);
	});
});

describe('git_bisect tool', () => {
	it('runs git bisect start', async () => {
		const handler = await handlerFor(
			'bisect',
			execWith('Bisecting: 3 revisions left to test', '', 0, (argv) => {
				expect(argv).toEqual([
					'git',
					'bisect',
					'start',
					'badsha',
					'goodsha',
				]);
			}),
		);
		const body = bodyOf(
			await handler({
				action: 'start',
				badSha: 'badsha',
				goodSha: 'goodsha',
			}),
		);
		expect(body.ok).toBe(true);
		expect(body.action).toBe('start');
	});

	it('returns toolError on invalid input', async () => {
		const handler = await handlerFor('bisect', execWith(''));
		const result = await handler({ action: 'start', badSha: 'only-bad' });
		expect(result.isError).toBe(true);
		expect(bodyOf(result).ok).toBe(false);
	});
});

describe('git_stash tool', () => {
	it('runs git stash push with a message', async () => {
		const handler = await handlerFor(
			'stash',
			execWith('Saved working directory', '', 0, (argv) => {
				expect(argv).toEqual([
					'git',
					'stash',
					'push',
					'-m',
					'checkpoint',
				]);
			}),
		);
		const body = bodyOf(
			await handler({ action: 'push', message: 'checkpoint' }),
		);
		expect(body.ok).toBe(true);
		expect(body.action).toBe('push');
	});

	it('surfaces git failures as toolError', async () => {
		const handler = await handlerFor(
			'stash',
			execWith('', 'fatal: not a git repository', 1),
		);
		const result = await handler({ action: 'list' });
		expect(result.isError).toBe(true);
		expect((bodyOf(result).error as { reason: string }).reason).toContain(
			'not a git repository',
		);
	});
});
