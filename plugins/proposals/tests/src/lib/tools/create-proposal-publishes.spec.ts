/**
 * create-proposal-publishes.spec.ts — the proof that authoring a
 * proposal PUBLISHES it, rather than advising someone to.
 *
 * The other specs around `create_proposal` run on temp workspaces with
 * no git runner, so they exercise the degraded path (publication
 * skipped, `nextAction` still owed). This one supplies a runner and
 * pins the behaviour that the whole enforcement exists for: the file
 * reaches a ref without the caller doing anything.
 *
 * Two agents left proposals untracked in a shared checkout in one week.
 * Advice did not stop it; this is what replaced the advice.
 *
 * The publishing specs run against a real repository with a remote,
 * because the property that matters (x00645) is what does NOT happen to
 * the checkout: `HEAD`, the checked-out branch and the shared index stay
 * exactly as they were.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';
import {
	createGitRunner,
	type IGitRunner,
} from '@delendai/proposals/lib/shared/git-runner';
import {
	buildCreateProposalRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

// The publication namespace is configuration: derive it from the same
// policy the tool is built with instead of pinning the old default.
const PR_PREFIX = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
}).branches.publicationRefPrefix;
const escapeRegExp = (value: string): string =>
	value.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
const PR_PATTERN = escapeRegExp(PR_PREFIX);

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * A shared checkout on `develop` with a bare `origin`, and a foreign
 * staged edit so a publication that touched the shared index would show.
 */
const sharedCheckout = (root: string): void => {
	const remote = mkdtempSync(join(tmpdir(), 'create-publishes-origin-'));
	roots.push(remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'author@example.com');
	git(root, 'config', 'user.name', 'Author');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# project\n');
	writeFileSync(join(root, 'foreign.ts'), 'export const x = 0;\n');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '--no-verify', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	writeFileSync(join(root, 'foreign.ts'), 'export const x = 1;\n');
	git(root, 'add', 'foreign.ts');
};

const optionsFor = (
	withGit = false,
	development: Record<string, unknown> = { profile: 'shared-checkout-pr' },
): IAuthoringToolOptions => {
	const root = mkdtempSync(join(tmpdir(), 'create-publishes-'));
	roots.push(root);
	if (withGit) sharedCheckout(root);
	const runner: IGitRunner | undefined = withGit
		? createGitRunner(root)
		: undefined;
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
		recursive: true,
	});
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	return {
		namespacePrefix: 'proposals',
		workspaceRoot: root,
		proposalsDirAbs: join(root, 'docs/delendai/proposals'),
		indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
		lockPathAbs: join(root, '.cache/agents.lock.json'),
		counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		layout: {
			proposalsDir: 'docs/delendai/proposals',
			proposalIndexFile: '.cache/delendai/proposals/index.json',
		},
		extraFolders: [],
		developmentPolicy: resolveDevelopmentPolicy({ development }),
		...(runner === undefined ? {} : { run: runner }),
	};
};

/** The registered `create_proposal` handler. */
const handlerFor = async (
	options: IAuthoringToolOptions,
): Promise<(args: unknown) => Promise<unknown>> => {
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await buildCreateProposalRegistration(options).register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as (args: unknown) => Promise<unknown>;
			},
		}),
	);
	expect(handler).toBeDefined();
	return handler as (args: unknown) => Promise<unknown>;
};

/** What `create_proposal` reports about the file it just wrote. */
interface ICreatedProposal {
	readonly nextAction: string;
	readonly published: boolean;
	readonly publishedRef?: string;
	readonly publishReason?: string;
	readonly file: string;
}

const created = async (
	handler: (args: unknown) => Promise<unknown>,
	title: string,
): Promise<ICreatedProposal> => {
	const result = (await handler({
		kind: 'feat',
		title,
		goal: 'prove publication happens',
		slices: [{ sliceId: 's1', files: ['src/one.ts'] }],
	})) as {
		readonly structuredContent?: ICreatedProposal;
	};
	const structured = result.structuredContent;
	if (structured === undefined) {
		throw new Error('create_proposal returned no structuredContent');
	}
	return structured;
};

describe('create_proposal publishes what it writes', () => {
	it('gets the new proposal onto its publication ref, unasked', async () => {
		const options = optionsFor(true);
		const root = options.workspaceRoot;

		const result = await created(
			await handlerFor(options),
			'A proposal that publishes itself',
		);

		expect(result.published).toBe(true);
		expect(result.publishedRef).toMatch(
			// The shape of every other publication: agent, unit, topic.
			new RegExp(`^${PR_PATTERN}[^/]+/create/f\\d{5}-all-g1/[^/]+$`, 'u'),
		);
		const published = git(
			root,
			'ls-remote',
			'origin',
			`refs/heads/${result.publishedRef ?? ''}`,
		);
		expect(published).not.toBe('');
	});

	it('leaves a proposal written in a unit to that unit, instead of a second ref', async () => {
		const options = optionsFor(true);
		const root = options.workspaceRoot;
		const unit = join(root, '.wt-unit');
		git(
			root,
			'worktree',
			'add',
			'-q',
			'-b',
			'wip/agent-a/f00001-S1-g1/the-work',
			unit,
			'HEAD',
		);
		mkdirSync(join(unit, 'docs/delendai/proposals/ready/feats'), {
			recursive: true,
		});

		const result = (
			(await (
				await handlerFor(options)
			)({
				kind: 'feat',
				title: 'Written in a unit',
				goal: 'travel with the unit',
				slices: [{ sliceId: 's1', files: ['src/one.ts'] }],
				checkout: unit,
			})) as { readonly structuredContent?: ICreatedProposal }
		).structuredContent;

		expect(result?.published).toBe(false);
		expect(result?.publishReason).toContain(
			'wip/agent-a/f00001-S1-g1/the-work',
		);
		expect(git(root, 'ls-remote', 'origin')).toBe('');
	});

	it('publishes only its own file, on top of the integration branch', async () => {
		const options = optionsFor(true);
		const root = options.workspaceRoot;
		const base = git(root, 'rev-parse', 'develop');

		const result = await created(
			await handlerFor(options),
			'Only its own file',
		);

		const sha = git(root, 'ls-remote', 'origin').split(/\s+/u)[0] ?? '';
		git(root, 'fetch', '-q', 'origin', sha);
		expect(git(root, 'rev-parse', `${sha}^`)).toBe(base);
		expect(
			git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', sha),
		).toBe(`docs/delendai/proposals/${result.file}`);
	});

	it('leaves HEAD, the branch and the shared index exactly as they were', async () => {
		const options = optionsFor(true);
		const root = options.workspaceRoot;
		const head = git(root, 'rev-parse', 'HEAD');
		const staged = git(root, 'diff', '--cached', '--name-only');

		await created(await handlerFor(options), 'Nothing moves');

		expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		expect(git(root, 'diff', '--cached', '--name-only')).toBe(staged);
		expect(git(root, 'for-each-ref', 'refs/delendai/')).toBe('');
	});

	it('still writes the document when no git runner exists, and says why', async () => {
		const result = await created(
			await handlerFor(optionsFor()),
			'No runner available',
		);

		// The degraded path must never lose the authored proposal.
		expect(result.file).toMatch(/f\d{5}-no-runner-available\.md$/u);
		expect(result.published).toBe(false);
		expect(result.publishReason).toMatch(/no git runner/u);
	});
});

describe('create_proposal on a project that lands without a pull request', () => {
	it('publishes no ref of its own and names the two commands that land the proposal', async () => {
		const options = optionsFor(true, {
			profile: 'shared-checkout-merge',
			branches: { integration: 'develop', namespacePrefix: 'acme' },
		});
		const root = options.workspaceRoot;

		const result = await created(
			await handlerFor(options),
			'Landed by merge',
		);

		const id = /^[a-z]\d{5}/u.exec(result.file.split('/').pop() ?? '')?.[0];
		expect(id).toBeDefined();
		expect(result.published).toBe(false);
		// Not the generic refusal: it says how this project lands work.
		expect(result.publishReason).toContain(
			'merging a unit of work into develop',
		);
		expect(git(root, 'ls-remote', 'origin')).toBe('');
		// A concrete step, not "finish the unit" for a unit that does not
		// exist yet: the file goes onto a create unit, and the unit lands.
		expect(result.nextAction).toContain(
			`delendai work checkpoint --proposal=${id} --slice=all --kind=create --paths=docs/delendai/proposals/${result.file}`,
		);
		expect(result.nextAction).toContain(
			`delendai work publish --proposal=${id} --slice=all --kind=create`,
		);
		expect(result.nextAction).toContain('MERGING');
		expect(result.nextAction).not.toMatch(/opens? a pull request/iu);
	});

	it('leaves a directly-integrating project to commit the file itself', async () => {
		const result = await created(
			await handlerFor(optionsFor(true, { profile: 'shared-direct' })),
			'Committed directly',
		);

		expect(result.published).toBe(false);
		expect(result.publishReason).toContain(
			'does not publish proposals on their own ref',
		);
		expect(result.nextAction).not.toContain('delendai work checkpoint');
		expect(result.nextAction).toContain('directly');
	});
});
