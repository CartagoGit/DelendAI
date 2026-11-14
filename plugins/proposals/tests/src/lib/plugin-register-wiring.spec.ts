/**
 * plugin-register-wiring.spec.ts — what `register()` hands the authoring
 * tools, driven through the real plugin rather than around it.
 *
 * `create_proposal` answers with the step that lands the proposal, and
 * that step is the PROJECT's decision: its own `publishCommand` when it
 * declares one, otherwise the resolved development policy's own words.
 * Both paths run through `register()`, which is also where the host's
 * options (folder policy, extra folders, persistence, sibling plugin
 * options) are resolved — so this drives the wiring end to end on a real
 * temporary workspace instead of asserting on a hand-built options bag.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import plugin from '@delendai/proposals';
import { createFakeToolServer } from '@delendai/test-kit/public';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-register-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
		recursive: true,
	});
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	return root;
};

const contextFor = (
	root: string,
	options: Readonly<Record<string, unknown>>,
	policyProfile?: string,
): IMcpPluginContext => ({
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
	options,
	args: {},
	pluginOptions: new Map<string, Readonly<Record<string, unknown>>>([
		[
			'commit-policy',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
				push: {
					enabled: true,
					onCommit: true,
					protectedBranches: ['main', 'release'],
				},
			},
		],
		['quality', { scopes: { proposals: ['bun run validate'] } }],
	]),
	...(policyProfile === undefined
		? {}
		: {
				developmentPolicy: resolveDevelopmentPolicy({
					development: { profile: policyProfile },
				}),
			}),
});

/** The `create_proposal` handler, as a host reaches it after `register()`. */
const createProposalHandler = async (
	ctx: IMcpPluginContext,
): Promise<(args: unknown) => Promise<unknown>> => {
	const registrations = await plugin.register(ctx);
	const registration = (registrations.tools ?? []).find(
		(tool) => tool.id === 'create_proposal',
	);
	expect(registration).toBeDefined();
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await registration?.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as (args: unknown) => Promise<unknown>;
			},
		}),
	);
	expect(handler).toBeDefined();
	return handler as (args: unknown) => Promise<unknown>;
};

const authorProposal = async (
	handler: (args: unknown) => Promise<unknown>,
	title: string,
): Promise<{ readonly file: string; readonly nextAction: string }> => {
	const result = (await handler({
		kind: 'feat',
		title,
		goal: 'prove the wiring register() performs',
		slices: [{ sliceId: 's1', files: ['src/one.ts'] }],
	})) as {
		readonly structuredContent?: {
			readonly file: string;
			readonly nextAction: string;
		};
	};
	expect(result.structuredContent).toBeDefined();
	return result.structuredContent as {
		readonly file: string;
		readonly nextAction: string;
	};
};

describe('register() wires the project’s publish step into create_proposal', () => {
	it('returns the project command, with the new proposal’s id and path filled in', async () => {
		const root = makeWorkspace();
		const handler = await createProposalHandler(
			contextFor(
				root,
				{
					publishCommand:
						'bun run forge:publish -- --ref=delendai/pr/proposal-{id} --path={path} --open-pr',
					proposalFolders: ['paused/demos'],
					persist: { mode: 'none' },
					requirePeerReview: false,
				},
				'shared-checkout-pr',
			),
		);

		const created = await authorProposal(handler, 'Wired publish command');

		expect(created.nextAction).toContain('bun run forge:publish');
		expect(created.nextAction).toContain(
			`docs/delendai/proposals/${created.file}`,
		);
		expect(created.nextAction).toMatch(/proposal-f\d{5}/u);
	});

	it('falls back to the development policy’s own words when no command is declared', async () => {
		const root = makeWorkspace();
		const handler = await createProposalHandler(
			contextFor(
				root,
				{ persist: { mode: 'none' }, requirePeerReview: false },
				'shared-checkout-pr',
			),
		);

		const created = await authorProposal(handler, 'Policy derived step');

		expect(created.nextAction).toContain('untracked');
		expect(created.nextAction).toContain('pull request');
	});

	it('never tells a project that merges locally to open a pull request', async () => {
		const root = makeWorkspace();
		const handler = await createProposalHandler(
			contextFor(
				root,
				{ persist: { mode: 'none' }, requirePeerReview: false },
				'shared-checkout-merge',
			),
		);

		const created = await authorProposal(handler, 'Merge profile step');

		expect(created.nextAction).not.toMatch(/opens? a pull request/iu);
		expect(created.nextAction).toContain('opens no pull request');
		expect(created.nextAction).toContain('untracked');
	});

	it('says only that the file must be tracked when the host declares no policy', async () => {
		const root = makeWorkspace();
		const handler = await createProposalHandler(
			contextFor(root, {
				persist: { mode: 'none' },
				requirePeerReview: false,
			}),
		);

		const created = await authorProposal(handler, 'No policy step');

		expect(created.nextAction).toContain('untracked');
		expect(created.nextAction).not.toContain('pull request');
	});
});

/** The `proposal_transition` handler, as a host reaches it after `register()`. */
const transitionHandler = async (
	ctx: IMcpPluginContext,
): Promise<(args: unknown) => Promise<unknown>> => {
	const registrations = await plugin.register(ctx);
	const registration = (registrations.tools ?? []).find(
		(tool) => tool.id === 'proposal_transition',
	);
	expect(registration).toBeDefined();
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await registration?.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as (args: unknown) => Promise<unknown>;
			},
		}),
	);
	return handler as (args: unknown) => Promise<unknown>;
};

/** A proposal in review whose only slice is done and shipped, ready to close. */
const proposalReadyForReview = (root: string): void => {
	mkdirSync(join(root, 'src'), { recursive: true });
	writeFileSync(join(root, 'src/one.ts'), 'export const one = 1;\n');
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
	git('init', '-q', '--initial-branch', 'develop');
	git('config', 'user.email', 'wiring@example.com');
	git('config', 'user.name', 'Wiring');
	git('config', 'commit.gpgsign', 'false');
	git('add', 'src/one.ts');
	git('commit', '-q', '--no-verify', '-m', 'feat: one');
	const shipped = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8',
	}).trim();
	mkdirSync(join(root, 'docs/delendai/proposals/review'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/review/f00999-wiring.md'),
		[
			'---',
			'id: f00999',
			'title: "Wiring"',
			'kind: feat',
			'status: review',
			'type: proposal',
			'---',
			'',
			'# f00999 — Wiring',
			'',
			'## goal',
			'',
			'Prove the wiring.',
			'',
			'## slices',
			'',
			'### S1 — one',
			'- **Status**: done',
			'- **Files**: `src/one.ts`',
			`- shipped-in: \`${shipped.slice(0, 12)}\``,
			'',
		].join('\n'),
	);
};

describe('register() hands the transition tool the evidence policy', () => {
	it('lets a project that turned requireValidateEvidence off close without validate evidence', async () => {
		const root = makeWorkspace();
		proposalReadyForReview(root);
		const transition = await transitionHandler(
			contextFor(root, {
				requireValidateEvidence: false,
				requirePeerReview: false,
			}),
		);

		const moved = await transition({
			id: 'f00999',
			to: 'done',
			reason: 'the slice is done',
		});

		expect(JSON.stringify(moved)).not.toContain('validate required');
	});

	it('asks for validate evidence to close when the project leaves the default on', async () => {
		const root = makeWorkspace();
		proposalReadyForReview(root);
		const transition = await transitionHandler(
			contextFor(root, { requirePeerReview: false }),
		);

		const moved = await transition({
			id: 'f00999',
			to: 'done',
			reason: 'the slice is done',
		});

		expect(JSON.stringify(moved)).toContain('validate required');
	});
});
