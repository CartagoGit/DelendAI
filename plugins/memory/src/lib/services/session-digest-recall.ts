/**
 * session-digest-recall.ts — pick the latest session digest (f00090 S3).
 *
 * When a long chat resumes, the agent should rehydrate from the most recent
 * `session-digest:<topic>` note it wrote with `memory_compact` rather than
 * re-reading the raw tail it already dropped. S1 made the digest a normal,
 * recallable note; this pure selector is the "newest first" wiring that
 * orientation calls. No clock, no I/O: deterministic over its input.
 */
import { SESSION_DIGEST_TITLE_PREFIX } from '../contracts/constants/session-digest.constant';
import type {
	ISessionDigestCandidate,
	ISessionDigestSelection,
} from '../contracts/interfaces/session-digest-recall.interface';

/**
 * Return the newest `session-digest:*` candidate (by `createdAt`, newest
 * first) or `null` when none are present. Ties on timestamp resolve to the
 * later position in the input so the selection is stable and deterministic.
 */
export const selectLatestSessionDigest = (
	candidates: readonly ISessionDigestCandidate[],
): ISessionDigestSelection | null => {
	let latest: ISessionDigestCandidate | undefined;
	for (const candidate of candidates) {
		if (!candidate.title.startsWith(SESSION_DIGEST_TITLE_PREFIX)) continue;
		// `>=` lets a later-positioned, equal-timestamp candidate win the tie.
		if (latest === undefined || candidate.createdAt >= latest.createdAt) {
			latest = candidate;
		}
	}
	if (latest === undefined) return null;
	return {
		title: latest.title,
		topic: latest.title.slice(SESSION_DIGEST_TITLE_PREFIX.length),
		body: latest.body,
		createdAt: latest.createdAt,
	};
};
