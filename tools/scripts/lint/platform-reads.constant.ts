/**
 * platform-reads.constant.ts — what counts as asking which machine this
 * is, and where the answer may be computed.
 */

/** The one folder that may ask the operating system directly. */
export const PLATFORM_DIR = 'packages/core/src/lib/platform/';

/** The baseline of today's reads outside it, which may only shrink. */
export const PLATFORM_READS_BASELINE =
	'tools/scripts/lint/platform-reads.baseline.json';

/** A platform question asked directly. */
export const PLATFORM_READ_PATTERNS: readonly RegExp[] = [
	/\bprocess\.platform\b/u,
	/\bos\.platform\(\)/u,
	/['"`]\/proc\/version['"`]/u,
];

/** Product code is scanned; tests may build any machine they need. */
export const PRODUCT_SOURCE =
	/^(packages|plugins|extensions)\/[^/]+\/src\/(?!.*\.(spec|test)\.ts$).*\.ts$/u;
