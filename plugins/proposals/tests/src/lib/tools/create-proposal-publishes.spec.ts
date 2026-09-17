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
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
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

/** Records every git call; answers a fixed SHA for `rev-parse`. */
const recordingRunner = (): {
	readonly run: IGitRunner;
	readonly calls: string[][];
} => {
	const calls: string[][] = [];
	const run: IGitRunner = async (args) => {
		calls.push([...args]);
		if (args[0] === 'rev-parse') {
			return { ok: true, output: 'feedfacecafe\n' };
		}
		return { ok: true, output: '' };
	};
	return { run, calls };
};

const optionsFor = (git?: IGitRunner): IAuthoringToolOptions => {
	const root = mkdtempSync(join(tmpdir(), 'create-publishes-'));
	roots.push(root);
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
		developmentPolicy: resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-pr' },
		}),
		...(git === undefined ? {} : { run: git }),
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
		const { run, calls } = recordingRunner();

		const result = await created(
			await handlerFor(optionsFor(run)),
			'A proposal that publishes itself',
		);

		expect(result.published).toBe(true);
		expect(result.publishedRef).toMatch(
			new RegExp(`^${PR_PATTERN}proposal-f\\d{5}$`, 'u'),
		);

		// Staged by path, committed, pushed by SHA to the ref.
		expect(calls[0]?.[0]).toBe('add');
		expect(calls.some((call) => call[0] === 'commit')).toBe(true);
		const push = calls.find((call) => call[0] === 'push');
		expect(push?.[1]).toBe('origin');
		expect(push?.[2]).toMatch(
			new RegExp(
				`^feedfacecafe:refs/heads/${PR_PATTERN}proposal-f\\d{5}$`,
				'u',
			),
		);
	});

	it('stages only the proposal it just wrote', async () => {
		const { run, calls } = recordingRunner();

		const result = await created(
			await handlerFor(optionsFor(run)),
			'Only its own file',
		);

		// `git add .` here would sweep a dirty tree into a docs commit.
		expect(calls[0]).toEqual([
			'add',
			'--',
			`docs/delendai/proposals/${result.file}`,
		]);
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
