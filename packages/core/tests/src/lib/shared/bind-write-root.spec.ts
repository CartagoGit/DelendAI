/**
 * bind-write-root.spec.ts
 *
 * A tool that declares `writeRoot: 'caller-checkout'` acts in the
 * checkout the call names — not only in its schema, but in the directory
 * its runner spawns in.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
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
import { createGitRunner } from '../../../../src/lib/shared/git-write';
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

	it('leaves the refusal to a tool that declared checkout itself', async () => {
		const own = z.object({ checkout: z.string().optional() });
		const { config, handler } = await bound(
			toolReportingItsRoot('caller-checkout', own),
		);
		expect(config.inputSchema).toBe(own);
		expect(await rootIn(handler({ checkout: '/elsewhere' }))).toBe(SERVER);
		expect(await rootIn(handler({ checkout: WORKTREE }))).toBe(WORKTREE);
	});

	it('extends a raw shape, and leaves a tool without input alone', async () => {
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
		const bare = await bound({
			...toolReportingItsRoot('caller-checkout'),
			register: async (server) => {
				server.registerTool('commit', {}, reportRoot);
			},
		});
		expect(bare.config.inputSchema).toBeUndefined();
		expect(await rootIn(bare.handler({}))).toBe(SERVER);
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
	const made: string[] = [];
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
