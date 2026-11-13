/**
 * link-check.interface.ts — types for the link-check plugin's markdown link +
 * anchor integrity scan. Kept under contracts/interfaces per the
 * types-in-contracts convention.
 */

/** One markdown document to scan: repo-relative path + full text. */
export interface ISourceDoc {
	readonly path: string;
	readonly content: string;
}

/** One extracted markdown link and the 1-indexed line it appears on. */
export interface IExtractedLink {
	readonly target: string;
	readonly line: number;
}

/** A parsed link target, classified for how it should be checked. */
export interface IParsedTarget {
	readonly kind: 'external' | 'anchor' | 'relative' | 'empty';
	/** Path portion (relative links only); '' otherwise. */
	readonly path: string;
	/** Fragment after `#`, or undefined when there is none. */
	readonly anchor: string | undefined;
}

/** A document the scan found and did not check, and why. */
export interface ISkippedDoc {
	readonly path: string;
	readonly reason: 'too-large' | 'unreadable';
}

/** The documents a scan read, and what it left out. */
export interface IDocScan {
	readonly docs: readonly ISourceDoc[];
	readonly skipped: readonly ISkippedDoc[];
	/** True when the scan stopped at its document cap. */
	readonly capped: boolean;
}

/** Injected I/O seam so the scan is unit-testable without a filesystem. */
export interface ILinkScanDeps {
	/** The markdown and MDX docs to scan, with the ones it left out. */
	readonly listDocs: () => Promise<IDocScan>;
	/** Every repo-relative path that exists (files and their ancestor dirs). */
	readonly listKnownPaths: () => Promise<ReadonlySet<string>>;
}

/** Options for the `link_check` tool builder. */
export interface ILinkCheckToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable deps for tests; production reads the filesystem. */
	readonly deps?: ILinkScanDeps;
}
