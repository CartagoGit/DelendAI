import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { sharedCheckout } from '@delendai/core/public';

import { appendPeerReviewJsonl } from '../shared/peer-review-log';

/** The work item a whole-proposal event belongs to. */
const WHOLE_PROPOSAL_ITEM = 'all';

/**
 * Where the work telemetry journal lives, relative to the shared
 * checkout. The private telemetry package drains it into the event bus.
 */
const WORK_EVENT_JOURNAL_RELATIVE =
	'.cache/delendai/telemetry/work-event-journal.ndjson';

const hashOf = (detail: Readonly<Record<string, string>>): string =>
	createHash('sha256')
		.update(
			JSON.stringify(
				Object.entries(detail).sort(([a], [b]) => a.localeCompare(b)),
			),
		)
		.digest('hex');

/**
 * Append one work event to the journal. A failure to record is swallowed:
 * observing a proposal must never fail the move or the review.
 */
const journal = async (
	workspaceRoot: string,
	event: {
		readonly kind: string;
		readonly workItem: string;
		readonly actor: string | undefined;
		readonly detail: Readonly<Record<string, string>>;
	},
): Promise<void> => {
	try {
		await appendPeerReviewJsonl(
			join(
				sharedCheckout(workspaceRoot) ?? workspaceRoot,
				WORK_EVENT_JOURNAL_RELATIVE,
			),
			{
				work_item_id: event.workItem,
				actor_id: event.actor ?? null,
				kind: event.kind,
				payload_hash: hashOf(event.detail),
				created_at: Date.now(),
			},
		);
	} catch {
		// Recording is advisory.
	}
};

/** Tell the journal that a proposal changed status. */
export const journalProposalTransition = (
	workspaceRoot: string,
	proposalId: string,
	from: string,
	to: string,
	agent: string | undefined,
): Promise<void> =>
	journal(workspaceRoot, {
		kind: 'proposal_transition',
		workItem: `${proposalId}/${WHOLE_PROPOSAL_ITEM}`,
		actor: agent,
		detail: { from, to },
	});

/** Tell the journal that an implementer handed a slice in for review. */
export const journalReviewSubmission = (
	workspaceRoot: string,
	proposalId: string,
	sliceId: string,
	agent: string | undefined,
): Promise<void> =>
	journal(workspaceRoot, {
		kind: 'slice_submitted',
		workItem: `${proposalId}/${sliceId}`,
		actor: agent,
		detail: { via: 'review' },
	});
