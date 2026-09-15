/**
 * index-reader-notice.ts — the once-per-path notice the proposal index
 * reader logs when it serves something other than the SQL projection.
 *
 * The read path runs on every index lookup, so a per-call warning would
 * drown the log; each distinct notice key is emitted once per process.
 */

/** Notice keys already emitted, so each notice is logged once. */
const fallbackNoticeEmitted = new Set<string>();

/**
 * Clears the one-time fallback notice bookkeeping. For tests that assert
 * "logged once" across several reads; never needed in production.
 */
export const resetProposalIndexFallbackNotice = (): void => {
	fallbackNoticeEmitted.clear();
};

export const defaultLog = (message: string): void => {
	console.warn(`[delendai] ${message}`);
};

export const noticeOnce = (
	key: string,
	message: string,
	log: (message: string) => void,
): void => {
	if (fallbackNoticeEmitted.has(key)) return;
	fallbackNoticeEmitted.add(key);
	log(message);
};
