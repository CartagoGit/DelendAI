/** Constants for `./self-ignoring-dir`. */

/** git's per-directory ignore file. */
export const SELF_IGNORE_FILE = '.gitignore';

/**
 * Ignore everything in this directory, this file included.
 *
 * The comment is for the person who opens it wondering what it is: they
 * are entitled to an answer from the file itself, not from a search.
 */
export const SELF_IGNORE_BODY = [
	'# Created by delendai. Everything here is regenerated from the',
	'# repository and the configuration, so none of it belongs in git.',
	'# Delete the directory freely; it comes back.',
	'*',
	'',
].join('\n');
