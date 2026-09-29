/**
 * The longest topic a new unit of work takes, in the characters its ref
 * keeps. A topic names the work in a few words; a reviewer that listed
 * every proposal of its pack in it made a branch name of 200 characters
 * nobody could read in a branch list. What a review unit claims is in its
 * commits, not its name.
 */
export const MAX_WORK_TOPIC_LENGTH = 48;
