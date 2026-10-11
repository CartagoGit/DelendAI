import type { IKnowledgeForce } from '../interfaces/knowledge-record.interface';

/**
 * Ordered strongest-permission to strongest-refusal. The index IS the
 * rank: `forceRank('required') < forceRank('removed')`. S3's policy
 * resolver uses this to compare a framework recommendation against a
 * project/user preference without re-deriving the order itself.
 */
export const FORCE_VALUES: readonly IKnowledgeForce[] = [
	'required',
	'recommended',
	'supported',
	'discouraged',
	'deprecated',
	'removed',
];
