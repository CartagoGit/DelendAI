/**
 * secrets.interface.ts — types for the security plugin's offline secret
 * scanner. Kept under contracts/interfaces per the types-in-contracts
 * convention.
 */
import type { FindingSeverity, IFinding } from '@mcp-vertex/core/public';

/** Result of a secret scan: how many files were read + the findings. */
export interface ISecretScanOutcome {
	readonly scanned: number;
	readonly findings: readonly IFinding[];
}

/** A high-precision secret-detection rule. */
export interface ISecretRule {
	/** Stable id, e.g. "aws-access-key-id". */
	readonly id: string;
	/** Human-readable description of what it matches. */
	readonly description: string;
	/** Severity assigned to a match. */
	readonly severity: FindingSeverity;
	/** Global regex matching the secret (group 0 is the match). */
	readonly pattern: RegExp;
}

/** A file the scanner inspects (path + full text). */
export interface ISecretScanFile {
	readonly path: string;
	readonly content: string;
}

/**
 * Injected I/O seam for the scan orchestrator, so `runSecretScan` is
 * unit-testable without touching the filesystem or git.
 */
export interface ISecretScanDeps {
	/** List candidate files for a scope ('changed' = working-tree, 'tracked' = all). */
	readonly listFiles: (
		scope: 'changed' | 'tracked',
	) => Promise<readonly string[]>;
	/** Read a repo-relative file's text, or undefined if unreadable. */
	readonly readFile: (path: string) => Promise<string | undefined>;
}

/** Options for the `security_secrets` tool builder. */
export interface ISecuritySecretsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable scan deps for tests; production uses the real git+fs adapter. */
	readonly deps?: ISecretScanDeps;
}
