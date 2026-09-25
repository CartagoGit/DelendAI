/**
 * bind-write-root.spec.ts
 *
 * A tool that declares `writeRoot: 'caller-checkout'` acts in the
 * checkout the call names — not only in its schema, but in the directory
 * its runner spawns in.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import z from 'zod';
import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';
import { activatePluginSession } from '@delendai/core/lib/plugins/plugin-activation-session';
import type {
	IMcpPlugin,
	IMcpPluginContext,
} from '@delendai/core/lib/plugins/plugin-contract';

import { bindWriteRoot } from '../../../../src/lib/shared/bind-write-root';
import {
	executionRootOr,
	runInExecutionRoot,
} from '../../../../src/lib/shared/execution-root';
import { buildFsToolRegistrations } from '../../../../src/lib/shared/fs-tools';
import { createGitRunner } from '../../../../src/lib/shared/git-write';
import {
	pathForCall,
	workspaceForCall,
} from '../../../../src/lib/shared/shared-checkout';
import { toolOk } from '../../../../src/lib/shared/tool-response';

const SERVER = '/repo';
const WORKTREE = '/tmp/worktrees/x638';

/** A fake `sharedCheckout`: both trees answer the same repository. */
const sameRepository = (from: string): string | undefined =>
	from === SERVER || from === WORKTREE ? SERVER : undefined;

interface IRegistered {
	readonly config: { readonly inputSchema?: unknown };
	readonly handler: (args: unknown) => unknown;
}

/** Registers `registration` on a server that only records what it got. */
const registerOn = async (
	registration: IToolRegistration,
): Promise<IRegistered> => {
	let registered: IRegistered | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: ({ config, handler }) => {
				registered = {
					config: config as IRegistered['config'],
					handler,
				};
			},
		}),
	);
	if (registered === undefined) throw new Error('nothing registered');
	return registered;
};

/** What a tool answered: the directory its runner would spawn in. */
const rootIn = async (answer: unknown): Promise<unknown> =>
	((await answer) as { structuredContent?: { root?: string } })
		.structuredContent?.root;

/** Answers with the directory a runner would spawn in right now. */
const reportRoot = async () => toolOk({ root: executionRootOr(SERVER) });

/** A tool that answers with the directory its runner would spawn in. */
const toolReportingItsRoot = (
	writeRoot: IToolRegistration['writeRoot'],
	inputSchema: z.ZodObject = z.object({ message: z.string() }),
): IToolRegistration => ({
	id: 'commit',
	summary: 'commit',
	effects: ['write'],
	...(writeRoot !== undefined ? { writeRoot } : {}),
	register: async (server) => {
		server.registerTool('commit', { inputSchema }, reportRoot);
	},
});

const made: string[] = [];
afterEach(() => {
	for (const dir of made.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const bound = (registration: IToolRegistration) =>
	registerOn(bindWriteRoot(registration, SERVER, sameRepository));

describe('bindWriteRoot', () => {
	it('leaves a tool with any other root exactly as it was', () => {
		for (const root of [
			'repository',
			'host-state',
			'server',
			'remote',
		] as const) {
			const registration = toolReportingItsRoot(root);
			expect(bindWriteRoot(registration, SERVER, sameRepository)).toBe(
				registration,
			);
		}
	});

	it('gives a caller-checkout tool the shared checkout argument', async () => {
		const { config } = await bound(toolReportingItsRoot('caller-checkout'));
		const schema = config.inputSchema as z.ZodObject;
		expect(Object.keys(schema.shape).sort()).toEqual([
			'checkout',
			'message',
		]);
		expect(schema.safeParse({ message: 'm' }).success).toBe(true);
	});

	it('runs the handler in the checkout the call names', async () => {
		const { handler } = await bound(
			toolReportingItsRoot('caller-checkout'),
		);
		expect(
			await rootIn(handler({ message: 'm', checkout: WORKTREE })),
		).toBe(WORKTREE);
	});

	it("runs in the server's root when the call names none", async () => {
		const { handler } = await bound(
			toolReportingItsRoot('caller-checkout'),
		);
		expect(await rootIn(handler({ message: 'm' }))).toBe(SERVER);
	});

	it('refuses a checkout of another repository before the handler runs', async () => {
		let ran = false;
		const registration: IToolRegistration = {
			...toolReportingItsRoot('caller-checkout'),
			register: async (server) => {
				server.registerTool(
					'commit',
					{ inputSchema: z.object({}) },
					async () => {
						ran = true;
						return toolOk();
					},
				);
			},
		};
		const { handler } = await bound(registration);
		const result = (await handler({ checkout: '/elsewhere' })) as {
			readonly isError?: boolean;
			readonly structuredContent: { readonly error: { reason: string } };
		};
		expect(ran).toBe(false);
		expect(result.isError).toBe(true);
		expect(result.structuredContent.error.reason).toContain('/elsewhere');
	});

	it('refuses an invalid checkout even for a tool that declared checkout itself', async () => {
		let ran = false;
		const own = z.object({ checkout: z.string().optional() });
		const registration: IToolRegistration = {
			...toolReportingItsRoot('caller-checkout', own),
			register: async (server) => {
				server.registerTool(
					'commit',
					{ inputSchema: own },
					async () => {
						ran = true;
						return toolOk();
					},
				);
			},
		};
		const { config, handler } = await bound(registration);
		expect(config.inputSchema).toBe(own);
		const result = (await handler({ checkout: '/elsewhere' })) as {
			readonly isError?: boolean;
		};
		expect(result.isError).toBe(true);
		expect(ran).toBe(false);
	});

	it('runs a tool that declared checkout itself in the checkout it names', async () => {
		const own = z.object({ checkout: z.string().optional() });
		const { handler } = await bound(
			toolReportingItsRoot('caller-checkout', own),
		);
		expect(await rootIn(handler({ checkout: WORKTREE }))).toBe(WORKTREE);
	});

	it('extends a raw shape, and refuses to register a tool with no input to carry checkout', async () => {
		const raw = await bound({
			...toolReportingItsRoot('caller-checkout'),
			register: async (server) => {
				server.registerTool(
					'commit',
					{ inputSchema: { message: z.string() } },
					reportRoot,
				);
			},
		});
		expect(Object.keys(raw.config.inputSchema as object).sort()).toEqual([
			'checkout',
			'message',
		]);
		expect(await rootIn(raw.handler({ checkout: WORKTREE }))).toBe(
			WORKTREE,
		);
		await expect(
			bound({
				...toolReportingItsRoot('caller-checkout'),
				register: async (server) => {
					server.registerTool('commit', {}, reportRoot);
				},
			}),
		).rejects.toThrow(/cannot carry a `checkout` argument/u);
	});
});

describe('plugin activation binds every tool it registers', () => {
	it('gives a plugin tool the checkout argument on the way to the server', async () => {
		const plugin: IMcpPlugin = {
			name: 'writer',
			register: () => ({
				tools: [toolReportingItsRoot('caller-checkout')],
			}),
		};
		const ctx = fakePartial<IMcpPluginContext>({
			workspace: {
				root: SERVER,
				resolve: (p: string) => `${SERVER}/${p}`,
			},
			options: {},
		});
		const runtime = await activatePluginSession({
			plugin,
			ctx,
			timeoutMs: 1_000,
		});
		const [tool] = runtime.registrations.tools ?? [];
		if (tool === undefined) throw new Error('no tool');
		const { config } = await registerOn(tool);
		expect(
			Object.keys((config.inputSchema as z.ZodObject).shape),
		).toContain('checkout');
	});
});

describe('a runner spawns in the bound checkout', () => {
	const repo = (): string => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), 'x638-')));
		execFileSync('git', ['init', '-q', dir]);
		made.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of made.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('runs git in its own root outside a call, and in the bound one inside', async () => {
		const own = repo();
		const callers = repo();
		const run = createGitRunner(own);
		const top = async () =>
			(await run(['rev-parse', '--show-toplevel'])).output.trim();
		expect(await top()).toBe(own);
		expect(await runInExecutionRoot(callers, top)).toBe(callers);
		expect(await top()).toBe(own);
	});
});

describe('paths and workspaces follow the bound call', () => {
	const workspace = {
		root: SERVER,
		resolve: (relative: string) => `${SERVER}/${relative}`,
	};

	it('a call-scoped workspace answers with the server root outside a call and the checkout inside', async () => {
		const scoped = workspaceForCall(workspace);
		expect(scoped.root).toBe(SERVER);
		expect(scoped.resolve('docs/a.md')).toBe(`${SERVER}/docs/a.md`);
		await runInExecutionRoot(WORKTREE, async () => {
			expect(scoped.root).toBe(WORKTREE);
			expect(scoped.resolve('docs/a.md')).toBe(`${WORKTREE}/docs/a.md`);
		});
	});

	it('a registration-time path moves inside a call and stays outside it', async () => {
		const dir = `${SERVER}/.cache/issues`;
		expect(pathForCall(dir, SERVER)).toBe(dir);
		await runInExecutionRoot(WORKTREE, async () => {
			expect(pathForCall(dir, SERVER)).toBe(`${WORKTREE}/.cache/issues`);
			// A path outside the server's root is not a fact about it.
			expect(pathForCall('/etc/elsewhere', SERVER)).toBe(
				'/etc/elsewhere',
			);
		});
	});
});

describe('fs_write writes into the checkout the call names', () => {
	it("lands the file in the worktree and not in the server's tree", async () => {
		const parent = realpathSync(mkdtempSync(join(tmpdir(), 'x638-fs-')));
		made.push(parent);
		const server = join(parent, 'checkout');
		const worktree = join(parent, 'worktree');
		execFileSync('git', ['init', '-q', '-b', 'develop', server]);
		execFileSync(
			'git',
			[
				'-c',
				'user.email=s@e.t',
				'-c',
				'user.name=S',
				'commit',
				'-q',
				'--allow-empty',
				'-m',
				'base',
			],
			{ cwd: server },
		);
		execFileSync('git', ['worktree', 'add', '-q', '-b', 'work', worktree], {
			cwd: server,
		});
		const fsWrite = buildFsToolRegistrations({
			namespacePrefix: 'core',
			workspaceRootAbs: server,
		}).find((tool) => tool.id === 'fs_write');
		if (fsWrite === undefined) throw new Error('no fs_write');
		const { handler } = await registerOn(bindWriteRoot(fsWrite, server));
		await handler({
			path: 'note.md',
			content: 'hello',
			checkout: worktree,
		});
		expect(existsSync(join(worktree, 'note.md'))).toBe(true);
		expect(existsSync(join(server, 'note.md'))).toBe(false);
	});
});

describe('a write the integration branch would receive directly', () => {
	const refuseServer = async (root: string) =>
		root === SERVER
			? 'the shared checkout is on the integration branch'
			: undefined;

	it('is refused, with the step that writes it through a unit of work, and the tool never runs', async () => {
		let ran = false;
		const registration: IToolRegistration = {
			id: 'commit',
			summary: 'commit',
			effects: ['write'],
			writeRoot: 'caller-checkout',
			register: async (server) => {
				server.registerTool(
					'commit',
					{ inputSchema: z.object({ message: z.string() }) },
					async () => {
						ran = true;
						return toolOk({});
					},
				);
			},
		};
		const { handler } = await registerOn(
			bindWriteRoot(registration, SERVER, sameRepository, refuseServer),
		);
		const answer = (await handler({ message: 'x' })) as {
			isError?: boolean;
			content?: { text?: string }[];
		};
		expect(answer.isError).toBe(true);
		expect(JSON.stringify(answer)).toContain('delendai work enter');
		expect(ran).toBe(false);
	});

	it('runs in the checkout the call names, which is no integration branch', async () => {
		const { handler } = await registerOn(
			bindWriteRoot(
				toolReportingItsRoot('caller-checkout'),
				SERVER,
				sameRepository,
				refuseServer,
			),
		);
		expect(
			await rootIn(handler({ message: 'x', checkout: WORKTREE })),
		).toBe(WORKTREE);
	});
});
