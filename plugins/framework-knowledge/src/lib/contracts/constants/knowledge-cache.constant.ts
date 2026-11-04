/** Directory under the cache root that holds every framework's knowledge. */
export const KNOWLEDGE_CACHE_DIR = 'knowledge';

/** Small file the common path reads: records without evidence. */
export const SUMMARY_FILE_NAME = 'summary.json';

/** Larger file only `framework_source` opens: evidence per rule. */
export const EVIDENCE_FILE_NAME = 'evidence.json';

/** Names the lockfile entry a set was produced for. */
export const META_FILE_NAME = 'meta.json';

/** Lockfiles to look for, in the order package managers are preferred. */
export const LOCKFILE_NAMES = [
	'bun.lock',
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
] as const;

/** Forces that make a record a recommendation the resolver may follow. */
export const RECOMMENDING_FORCES = ['required', 'recommended'] as const;
