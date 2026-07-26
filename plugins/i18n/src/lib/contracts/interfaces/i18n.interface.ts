/**
 * i18n.interface.ts — types for the i18n plugin's cross-locale consistency
 * check. Kept under contracts/interfaces per the types-in-contracts convention.
 */

/** One locale file: its name + parsed (possibly nested) messages. */
export interface ILocaleFile {
	/** Locale id (usually the filename stem, e.g. "en", "es"). */
	readonly locale: string;
	/** The parsed JSON message object (may be nested). */
	readonly data: Record<string, unknown>;
}

/** One source file scanned for translation-key usage. */
export interface ISourceFile {
	readonly path: string;
	readonly content: string;
}

/** Injected I/O seam so the check is unit-testable without a filesystem. */
export interface II18nScanDeps {
	/** List every locale file under the configured directory. */
	readonly listLocales: () => Promise<readonly ILocaleFile[]>;
	/** List source files that may reference translation keys. */
	readonly listSourceFiles?: () => Promise<readonly ISourceFile[]>;
}

/** Options for the `i18n_check` tool builder. */
export interface II18nCheckToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable reader for tests; production reads the filesystem. */
	readonly deps?: II18nScanDeps;
}

/** Options for the `i18n_validate` tool builder. */
export interface II18nValidateToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable reader for tests; production reads the filesystem. */
	readonly deps?: II18nScanDeps;
}
