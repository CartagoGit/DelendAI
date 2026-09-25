/**
 * review-repo.ts — a real repository whose history looks like an
 * adopter's: work reaches `develop` through merges of the project's
 * publication refs, and a proposal reaches `review/` with no round open.
 * Shared by the review specs so each stays about one behaviour.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	resolveDevelopmentPolicy,
	type IToolRegistration,
} from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';
import {
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

type IHandler = (args: unknown) => Promise<{
	readonly content: readonly { readonly text: string }[];
	readonly isError?: boolean;
}>;

export interface IToolAnswer {
	readonly isError: boolean;
	readonly body: Record<string, unknown>;
	readonly text: string;
}

export const captureHandler = async (
	registration: IToolRegistration,
): Promise<(args: unknown) => Promise<IToolAnswer>> => {
	let handler: IHandler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as IHandler;
			},
		}),
	);
	const captured = handler;
	if (captured === undefined) throw new Error('no handler registered');
	return async (args) => {
		const result = await captured(args);
		// Every answer, refusals included, is a JSON envelope.
		const text = result.content[0]?.text ?? '{}';
		const body = JSON.parse(text) as Record<string, unknown>;
		return { isError: result.isError === true, body, text };
	};
};

export const EVIDENCE = {
	validateExitCode: 0,
	testsPassing: 3,
	testsTotal: 3,
} as const;

export const SLICE_S1 = (status: string): string => `### S1 — the work
- **Status**: ${status}
- **Files**: \`src/a.ts\`
`;

export interface IReviewRepo {
	readonly root: string;
	readonly git: (...args: string[]) => string;
	/** Commit `file` on a branch and merge it into develop. */
	readonly deliverThroughPullRequest: (
		file: string,
		ref: string,
		message?: string,
		mergeMessage?: string,
	) => string;
	/** A proposal already in review, with these slices and no rounds. */
	readonly proposalInReview: (slices: string, id?: string) => string;
	readonly options: (
		overrides?: Partial<IAuthoringToolOptions>,
	) => IAuthoringToolOptions;
	/** Call `proposal_review` on x00001 S1 unless the args say otherwise. */
	readonly review: (
		args: Record<string, unknown>,
		overrides?: Partial<IAuthoringToolOptions>,
	) => Promise<IToolAnswer>;
	readonly cleanup: () => void;
}

export const createReviewRepo = (): IReviewRepo => {
	const root = mkdtempSync(join(tmpdir(), 'review-repo-'));
	const git = (...args: string[]): string =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'owner@example.com');
	git('config', 'user.name', 'Owner');
	git('config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'src'));
	writeFileSync(join(root, 'README.md'), '# project\n');
	git('add', '.');
	git('commit', '-q', '--no-verify', '-m', 'base');
	mkdirSync(join(root, 'docs/delendai/proposals/review'), {
		recursive: true,
	});
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	const indexed: { id: string; file: string }[] = [];

	const options = (
		overrides: Partial<IAuthoringToolOptions> = {},
	): IAuthoringToolOptions => ({
		namespacePrefix: 'proposals',
		workspaceRoot: root,
		proposalsDirAbs: join(root, 'docs/delendai/proposals'),
		indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
		lockPathAbs: join(root, '.cache/agents.lock.json'),
		peerReviewLogPathAbs: join(
			root,
			'.cache/delendai/proposals/peer-review.jsonl',
		),
		counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		developmentPolicy: resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
		requireValidateEvidence: false,
		...overrides,
	});

	return {
		root,
		git,
		deliverThroughPullRequest: (
			file,
			ref,
			message = 'feat: the work',
			mergeMessage = `Merge pull request #7 from Owner/${ref}`,
		) => {
			git('switch', '-q', '-c', 'feature');
			writeFileSync(
				join(root, file),
				`export const x = ${Date.now()};\n`,
			);
			git('add', file);
			git('commit', '-q', '--no-verify', '-m', message);
			const delivered = git('rev-parse', 'HEAD');
			git('switch', '-q', 'develop');
			git(
				'merge',
				'-q',
				'--no-ff',
				'--no-verify',
				'-m',
				mergeMessage,
				'feature',
			);
			git('branch', '-q', '-D', 'feature');
			return delivered;
		},
		proposalInReview: (slices, id = 'x00001') => {
			const file = `review/${id}-work.md`;
			const path = join(root, 'docs/delendai/proposals', file);
			writeFileSync(
				path,
				`---
id: ${id}
title: Work
kind: fix
status: review
type: proposal
---

# ${id} — Work

## Slices

${slices}`,
			);
			if (!indexed.some((entry) => entry.id === id))
				indexed.push({ id, file });
			writeFileSync(
				join(root, '.cache/delendai/proposals/index.json'),
				`${JSON.stringify({ proposals: indexed })}\n`,
			);
			return path;
		},
		options,
		review: async (args, overrides = {}) => {
			const handler = await captureHandler(
				buildReviewRegistration(options(overrides)),
			);
			return handler({ proposalId: 'x00001', sliceId: 'S1', ...args });
		},
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
};
