/** The folder `work revalidate` reads, below the project root. */
export const READY_PROPOSALS_DIR = 'docs/delendai/proposals/ready';

/** The unit of a revalidation batch: the review batch under its own topic. */
export const REVALIDATION_UNIT_FLAGS = [
	'--proposal=batch',
	'--slice=all',
	'--kind=review',
	'--topic=revalidation',
] as const;
