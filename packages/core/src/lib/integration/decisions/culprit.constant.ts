/**
 * Constants for `./culprit.helper`.
 *
 * The most pull requests one train carries. Bisecting a red train of
 * eight costs at most three more runs; a longer train saves less
 * than a red one costs.
 */
export const TRAIN_CAPACITY = 8;
