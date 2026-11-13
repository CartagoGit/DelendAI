/**
 * proposal-review-note-literal.spec.ts — a reviewer's note is written as
 * it was given.
 *
 * The slice was spliced back with the note in a replacement string, so a
 * note quoting a pattern that ends in `$'` had the rest of the document
 * inserted into it: a second copy of the next slice, and the note cut.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IToolRegistration } from '@delendai/core/contracts';
import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import {
	buildCreateProposalRegistration,
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

type Handler = (args: unknown) => Promise<{ content: { text: string }[] }>;

const capture = async (registration: IToolRegistration): Promise<Handler> => {
	let handler: Handler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as Handler;
			},
		}),
	);
	if (handler === undefined) throw new Error('the tool never registered');
	return handler;
};

const okOf = async (result: Promise<{ content: { text: string }[] }>) =>
	(JSON.parse((await result).content[0]?.text ?? '{}') as { ok?: boolean })
		.ok;

describe('a review note is text, not a replacement pattern', () => {
	it("keeps a note quoting `$'` whole, and the document unchanged around it", async () => {
		const root = mkdtempSync(join(tmpdir(), 'review-note-literal-'));
		const opts: IAuthoringToolOptions = {
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
		};
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00082',
			title: 'Quote me',
			goal: 'work',
			slices: [
				{ sliceId: 's1', files: ['src/a.ts'] },
				{ sliceId: 's2', files: ['src/b.ts'] },
			],
		});
		const review = await capture(buildReviewRegistration(opts));
		expect(
			await okOf(
				review({
					proposalId: 'f00082',
					sliceId: 's1',
					action: 'submit',
					agent: 'falcon',
				}),
			),
		).toBe(true);
		const note =
			"the schema pattern '^(?:@[a-z]+/)?[a-z]*$' and $& and $1 stay as written";
		expect(
			await okOf(
				review({
					proposalId: 'f00082',
					sliceId: 's1',
					action: 'request_changes',
					agent: 'eagle',
					note,
				}),
			),
		).toBe(true);
		const doc = readFileSync(
			join(opts.proposalsDirAbs, 'ready/feats/f00082-quote-me.md'),
			'utf8',
		);
		expect(doc).toContain(note);
		expect(doc.match(/^### S2\b/gmu)).toHaveLength(1);
	});
});
