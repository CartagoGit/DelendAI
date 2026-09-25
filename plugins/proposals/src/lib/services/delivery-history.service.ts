/**
 * delivery-history.service.ts — what the integration branch received,
 * read once, for the review queue to find each slice's delivery in
 * (x00646).
 *
 * A merge delivers its second parent; a squashed or rebased commit
 * delivers itself. Units are recognised by the project's own ref shape
 * (see `work-ref-mention.ts`), and, as a fallback for work delivered
 * under a ref the template does not decode, by a message that cites the
 * proposal id.
 */
import type { IDeliveryCandidate } from '../contracts/interfaces/review-queue.interface';
import type {
	IIntegrationRecord,
	IWorkRefShape,
} from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import { findWorkRefMention } from './work-ref-mention';

export type { IIntegrationRecord } from '../contracts/interfaces/review-attribution.interface';

/** How far back along the integration branch deliveries are looked for. */
const DELIVERY_HISTORY_DEPTH = 5000;

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';

/** The key a delivery is filed under: its proposal and slice. */
export const unitKey = (proposal: string, slice: string): string =>
	`${proposal.toLowerCase()}#${slice.toLowerCase()}`;

/** The integration branch's first-parent history, messages included. */
export const readIntegrationHistory = async (
	run: IGitRunner,
	integration: string,
): Promise<readonly IIntegrationRecord[]> => {
	const log = await run([
		'log',
		'--first-parent',
		`--max-count=${DELIVERY_HISTORY_DEPTH.toString()}`,
		`--format=%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
		integration,
	]);
	if (!log.ok) return [];
	const records: IIntegrationRecord[] = [];
	for (const record of log.output.split(RECORD_SEPARATOR)) {
		const [sha, parents, message] = record.trim().split(FIELD_SEPARATOR);
		if (sha === undefined || sha.length === 0 || message === undefined)
			continue;
		const merged = (parents ?? '').trim().split(/\s+/u)[1];
		records.push({
			delivered: merged ?? sha,
			subject: message.split('\n')[0]?.trim() ?? sha,
			message,
		});
	}
	return records;
};

/**
 * Every unit of work the integration branch received, keyed by the
 * proposal and slice its ref names, decoded with the project's template.
 */
export const indexDeliveries = (
	history: readonly IIntegrationRecord[],
	shape: IWorkRefShape,
): ReadonlyMap<string, readonly IDeliveryCandidate[]> => {
	const deliveries = new Map<string, IDeliveryCandidate[]>();
	for (const record of history) {
		const mention = findWorkRefMention(record.message, shape);
		if (mention === undefined || mention.proposal.length === 0) continue;
		const key = unitKey(mention.proposal, mention.slice);
		const known = deliveries.get(key) ?? [];
		known.push({
			commit: record.delivered,
			source: `${record.subject} (${mention.ref})`,
		});
		deliveries.set(key, known);
	}
	return deliveries;
};

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Records whose message cites the proposal id as a word — the fallback
 * for work delivered under a ref the template does not decode. They are
 * only candidates: attribution still has to find who delivered them.
 */
export const citingRecords = (
	history: readonly IIntegrationRecord[],
	proposalId: string,
): readonly IDeliveryCandidate[] => {
	const cites = new RegExp(
		`(^|[^A-Za-z0-9])${escapeRegExp(proposalId)}([^A-Za-z0-9]|$)`,
		'iu',
	);
	return history
		.filter((record) => cites.test(record.message))
		.map((record) => ({
			commit: record.delivered,
			source: `${record.subject} (cites ${proposalId})`,
		}));
};
