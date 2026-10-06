/**
 * scan/index.ts — barrel for the scan helpers (c00126 S1).
 *
 * Re-exports every pure helper that the SOLID-compliance lint (and any
 * future lint) can adopt. Anything I/O-bound lives in `ts-walker.ts`;
 * the rest are pure scanners that take a body string and return hits.
 */
export { toRelPosix } from './path-utils';
export { lineOf, fnv1a } from './text-utils';
export {
	walkTsFiles,
	type IWalkTsFilesOptions,
} from './ts-walker';
export {
	shingleBlocks,
	type IShingleHit,
	type IShingleOptions,
} from './shingle';
export {
	detectLongChains,
	type ChainKind,
	type ILongChainHit,
	type ILongChainsOptions,
} from './long-chains';
export { detectCatchSwallow, type ICatchSwallowHit } from './catch-swallow';
export {
	detectMagicNumbers,
	MAGIC_WHITELIST,
	type IMagicNumberHit,
} from './magic-numbers';
export {
	detectDipViolations,
	type DipKind,
	type IDipHit,
} from './dip-violation';
export {
	buildRegistrySkeleton,
	formatFixProposal,
	type IFixProposal,
} from './long-chains-fix';
