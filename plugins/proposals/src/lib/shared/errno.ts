/**
 * errno.ts — narrow Node errno checks shared across this plugin.
 *
 * `isMissingFileErrno` had two byte-identical copies (the release audit
 * log and the peer-review log), each covered only by its own tests. The
 * distinction it draws is load-bearing and easy to get subtly wrong in
 * one copy and not the other, so it is single-sourced here.
 */

/**
 * True only for ENOENT — the legitimate "no log yet" state.
 *
 * x00154 S6: ENOTDIR (a parent path that is a file) and EACCES/EIO/… are
 * real read failures the caller must surface, not paper over. Treating
 * any errno as "missing" silently turns a broken path or a permissions
 * problem into an empty log.
 */
export const isMissingFileErrno = (err: unknown): boolean => {
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT';
};
