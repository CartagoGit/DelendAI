import type { IDelendaiConfigFile } from '../../plugins/load-config-file';

/**
 * f00109 S1 — contracts for the dead-config workspace-layout diagnostic
 * (`diagnoseWorkspaceLayout`): the probe verdict for one workspace-
 * relative path, the caller-supplied probe seam, and the argument
 * bundle. The detector itself lives in
 * `plugins/diagnose-workspace-layout.ts`.
 */

/** Probe verdict for one workspace-relative path. */
export type WorkspacePathStatus = 'exists' | 'missing' | 'escapes';

/**
 * Caller-supplied probe: resolve `relPath` against the workspace root
 * (containment included) and report what is there. Keeping the
 * filesystem behind this seam keeps the diagnostic pure and testable.
 */
export type WorkspaceLayoutProbe = (relPath: string) => WorkspacePathStatus;

export interface IWorkspaceLayoutArgs {
	readonly config: IDelendaiConfigFile;
	/**
	 * Whether a config file was actually present. When it is not, the
	 * defaults are in play and a missing `docs/delendai` is the normal
	 * pre-scaffold state of a fresh project — not worth a warning.
	 */
	readonly configPresent: boolean;
	/** The RESOLVED docsDir (CLI flag > config file > default). */
	readonly docsDir: string;
	readonly probe: WorkspaceLayoutProbe;
}
