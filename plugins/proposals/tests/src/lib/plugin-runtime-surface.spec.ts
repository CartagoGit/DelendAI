/**
 * plugin-runtime-surface.spec.ts — the parts of the proposals plugin the
 * HOST calls after `register()` returns, rather than the tools.
 *
 * `register()` hands back more than a tool list: the lifecycle hooks the
 * server drives on every call (`onToolCall`, `isAgentStuck`,
 * `getCheckpointAdvisory`, `beforeToolCall`), the orientation knowledge
 * that depends on whether a proposals store exists yet, and the SQL
 * lifecycle readers the transition tools consult. None of them is
 * reachable from a tool handler, so they are driven here directly — on a
 * workspace with no database at all, which is exactly the state a fresh
 * checkout boots in.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import plugin, { buildSqlLifecycleReaders } from '@delendai/proposals';
import { createFakeToolServer } from '@delendai/test-kit/public';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeWorkspace = (withStore: boolean): string => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-runtime-'));
	roots.push(root);
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	if (withStore) {
		mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
			recursive: true,
		});
	}
	return root;
};

const contextFor = (
	root: string,
	options: Readonly<Record<string, unknown>> = {},
): IMcpPluginContext =>
	({
		workspace: {
			root,
			resolve: (relativePath: string) => join(root, relativePath),
		},
		corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
		keepLegacy: false,
		pluginCacheDir: '.cache/delendai/proposals',
		pluginDocsDir: 'docs/delendai/proposals',
		namespacePrefix: 'proposals',
		options: { persist: { mode: 'none' }, ...options },
		args: {},
		pluginOptions: new Map<string, Readonly<Record<string, unknown>>>(),
	}) as unknown as IMcpPluginContext;

type TRegistration = Awaited<ReturnType<typeof plugin.register>>;

const registerOn = async (
	root: string,
	options?: Readonly<Record<string, unknown>>,
): Promise<TRegistration> => plugin.register(contextFor(root, options));

/** The context both advisory hooks are handed on every observed call. */
const ADVISORY_CONTEXT = { toolName: 'proposals_board', args: {} } as const;

describe('the runtime surface register() hands the host', () => {
	it('classifies observed tool calls and keeps the window bounded', async () => {
		const registration = await registerOn(makeWorkspace(true));

		// One of each kind the classifier distinguishes, then far more than
		// the 32-call window so the trim branch runs too.
		registration.onToolCall?.(
			'proposals_validate',
			{},
			undefined,
			undefined,
		);
		registration.onToolCall?.('proposals_edit', {}, undefined, undefined);
		registration.onToolCall?.('proposals_board', {}, undefined, undefined);
		for (let index = 0; index < 40; index += 1) {
			registration.onToolCall?.(
				`proposals_step_${index}`,
				{},
				undefined,
				undefined,
			);
		}

		// The advisory is computed from that same window; it must stay
		// answerable (a verdict or nothing) rather than throw once trimmed.
		expect(() =>
			registration.getCheckpointAdvisory?.(ADVISORY_CONTEXT),
		).not.toThrow();
	});

	it('answers no advisory at all when the host disables checkpoint advisories', async () => {
		const registration = await registerOn(makeWorkspace(true), {
			checkpointAdvisories: { enabled: false },
		});

		registration.onToolCall?.(
			'proposals_validate',
			{},
			undefined,
			undefined,
		);

		expect(
			registration.getCheckpointAdvisory?.(ADVISORY_CONTEXT),
		).toBeNull();
	});

	it('guards pushes without inventing a blocker for unrelated tools', async () => {
		const registration = await registerOn(makeWorkspace(true));

		expect(
			registration.beforeToolCall?.({
				toolName: 'proposals_git_push',
				args: {},
			}),
		).toBeNull();
		expect(
			registration.beforeToolCall?.({
				toolName: 'proposals_board',
				args: {},
			}),
		).toBeNull();
	});

	it('leaves the push guard silent when the host turns it off', async () => {
		const registration = await registerOn(makeWorkspace(true), {
			checkpointAdvisories: { pushGuard: { enabled: false } },
		});

		expect(
			registration.beforeToolCall?.({
				toolName: 'proposals_git_push',
				args: {},
			}),
		).toBeNull();
	});

	it('reaches no stuck verdict about an agent that has not worked yet', async () => {
		const registration = await registerOn(makeWorkspace(true));

		// No window, no verdict — the detector says nothing rather than
		// clearing an agent it has never observed.
		expect(registration.isAgentStuck?.('Carthage', {})).toBeNull();
	});

	it('names the bootstrap call only while the workspace has no store', async () => {
		const withoutStore = await registerOn(makeWorkspace(false));
		const withStore = await registerOn(makeWorkspace(true));

		const idsOf = (registration: TRegistration): readonly string[] =>
			(registration.knowledge ?? []).map((entry) => entry.id);

		expect(idsOf(withoutStore)).toContain('proposals-store-missing');
		expect(idsOf(withStore)).not.toContain('proposals-store-missing');
		// The workflow orientation is unconditional in both.
		expect(idsOf(withStore)).toContain('proposals-workflow');
	});

	it('rejects host options that do not match the plugin’s own schema', async () => {
		await expect(
			registerOn(makeWorkspace(true), {
				proposalFolders: 'paused/demos',
			}),
		).rejects.toThrow(/rejected its options/u);
	});
});

describe('the SQL lifecycle readers on a workspace with no database', () => {
	it('reads zeroes and nulls instead of failing the boot', async () => {
		const readers = buildSqlLifecycleReaders(makeWorkspace(true));

		expect(await readers.count()).toEqual({
			proposals: 0,
			plans: 0,
			slices: 0,
		});
		expect(await readers.lastSync()).toEqual({
			at: undefined,
			sourceCommit: undefined,
		});
		expect(
			await readers.getProposalState({ proposalId: 'f00547' }),
		).toBeNull();
		expect(await readers.getPlanState({ planId: 'q00034' })).toBeNull();
		expect(
			await readers.getSliceState({
				proposalId: 'f00547',
				sliceId: 's1',
			}),
		).toBeNull();
	});

	it('looks a proposal up by every path spelling the caller might hold', async () => {
		const root = makeWorkspace(true);
		const readers = buildSqlLifecycleReaders(root);

		// Absolute, workspace-relative and proposals-relative spellings of
		// the same file all resolve through the candidate builder; with no
		// database behind it each still answers null rather than throwing.
		const relativePath = 'docs/delendai/proposals/ready/feats/f00547-x.md';
		for (const path of [
			join(root, relativePath),
			relativePath,
			'ready/feats/f00547-x.md',
		]) {
			expect(
				await readers.getProposalState({ proposalId: 'f00547', path }),
			).toBeNull();
		}
	});
});

describe('the tools register() wires its own dependencies into', () => {
	/** One registered tool's handler, as a host reaches it. */
	const handlerFor = async (
		root: string,
		toolId: string,
	): Promise<(args: unknown) => Promise<unknown>> => {
		const registration = await registerOn(root);
		const tool = (registration.tools ?? []).find(
			(each) => each.id === toolId,
		);
		expect(tool, `no ${toolId} registration`).toBeDefined();
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		await tool?.register(
			createFakeToolServer({
				onRegisterTool: (call) => {
					handler = call.handler as (
						args: unknown,
					) => Promise<unknown>;
				},
			}),
		);
		expect(handler).toBeDefined();
		return handler as (args: unknown) => Promise<unknown>;
	};

	it('reads incidents through the log store it built, and drafts none from an empty one', async () => {
		const handler = await handlerFor(
			makeWorkspace(true),
			'incident_proposals',
		);

		// No `write`, so this only reads: the reader register() supplied is
		// the thing under test, and a workspace with no incident log must
		// answer "nothing to propose" rather than fail.
		const result = (await handler({})) as {
			readonly structuredContent?: {
				readonly drafts?: readonly unknown[];
			};
		};

		expect(result.structuredContent).toBeDefined();
		expect(result.structuredContent?.drafts).toEqual([]);
	});

	it('feeds the same reader to the auto-fix queue', async () => {
		const handler = await handlerFor(makeWorkspace(true), 'auto_fix_queue');

		const result = (await handler({})) as {
			readonly structuredContent?: Readonly<Record<string, unknown>>;
		};

		expect(result.structuredContent).toBeDefined();
	});

	it('tells the loop detector to forget a name when its task is released', async () => {
		const handler = await handlerFor(makeWorkspace(true), 'agent_names');

		const assigned = (await handler({
			action: 'assign',
			task_id: 'f00547.s1',
			agent_slot: 'implementation_runner',
		})) as { readonly isError?: boolean };
		expect(assigned.isError ?? false).toBe(false);

		// The release path is the one that reaches `onAgentReleased`, the
		// adapter register() builds so a reused name starts with a clean
		// loop-detector window.
		const released = (await handler({
			action: 'release',
			task_id: 'f00547.s1',
		})) as { readonly content: ReadonlyArray<{ readonly text: string }> };

		expect(
			JSON.parse(released.content[0]?.text ?? '{}').released,
		).toContain('f00547.s1');
	});
});

describe('the prompts register() offers the host', () => {
	/** The prompt handlers, keyed by the name they register under. */
	const promptTexts = async (
		root: string,
	): Promise<Readonly<Record<string, string>>> => {
		const registration = await registerOn(root);
		const texts: Record<string, string> = {};
		for (const prompt of registration.prompts ?? []) {
			await prompt.register({
				registerPrompt: (
					name: string,
					_config: unknown,
					handler: () => Promise<{
						messages: ReadonlyArray<{
							content: { text: string };
						}>;
					}>,
				) => {
					// Resolved below; registration itself must stay sync-fast.
					texts[name] = '';
					void handler().then((result) => {
						texts[name] = result.messages
							.map((message) => message.content.text)
							.join('\n');
					});
				},
			} as never);
		}
		// Let the handler promises settle before reading the texts.
		await new Promise((resolve) => setTimeout(resolve, 0));
		return texts;
	};

	it('tells a working agent which call starts the loop', async () => {
		const texts = await promptTexts(makeWorkspace(true));

		expect(Object.keys(texts)).toContain('proposals_work');
		expect(texts['proposals_work']).toContain('proposals_auto_work');
		expect(texts['proposals_work']).toContain('agent_lock');
	});

	it('tells an orchestrator to plan disjoint slices before delegating', async () => {
		const texts = await promptTexts(makeWorkspace(true));

		expect(Object.keys(texts)).toContain('proposals_orchestrate');
		expect(texts['proposals_orchestrate']).toContain(
			'proposals_proposal_board',
		);
		expect(texts['proposals_orchestrate']).toContain('disjoint');
	});
});
