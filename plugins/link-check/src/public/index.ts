/**
 * Public surface of `@delendai/link-check`. Pure markdown link + anchor
 * checking primitives for programmatic reuse.
 */
export {
	checkLinks,
	extractLinks,
	headingAnchors,
	parseTarget,
	slugify,
} from '../lib/link-check/check-links';
export { realLinkScanDeps } from '../lib/link-check/real-deps';
export type {
	IExtractedLink,
	ILinkCheckToolOptions,
	ILinkScanDeps,
	IParsedTarget,
	ISourceDoc,
} from '../lib/contracts/interfaces/link-check.interface';
