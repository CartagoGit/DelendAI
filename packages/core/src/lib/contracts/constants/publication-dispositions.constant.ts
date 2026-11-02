/**
 * publication-dispositions.constant.ts — where the queue's last verdict on
 * each pull request is kept, relative to the cache directory.
 */
export const PUBLICATION_DISPOSITIONS_FILE =
	'forge/publication-dispositions.json';

/** The disposition that waits on the pull request's author alone. */
export const AUTHOR_DISPOSITION = 'author';
