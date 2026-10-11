/**
 * host-instructions-inventory.interface.ts — f00094 S2.
 *
 * The structured, deterministic inventory produced by
 * `scanHostInstructions` (see `../../tools/scan-host-instructions.tool`).
 * It captures WHAT the current host-instruction files say today, across
 * two surfaces:
 *
 *   - **in-repo** — the three checked-in host files (`AGENTS.md`,
 *     `CLAUDE.md`, `.github/copilot-instructions.md`). Always scanned.
 *   - **user-home** — host-specific config outside the repo
 *     (`~/.cursorrules`, `~/.aider.conf.yml`, …). Scanned only when the
 *     caller opts in with `scope: 'all'`.
 *
 * The inventory is data, not instructions: `inherit_host_instructions`
 * turns it into a `ready` proposal for the next `auto_work` pass to
 * review, exactly like f00093's in-repo snapshot — it never rewrites a
 * host file itself.
 */

/** Which config surface a host-instruction file lives on. */
export type THostInstructionSurface = 'in-repo' | 'user-home';

/**
 * How wide the scan reaches. `repo` (default) reads only the three
 * in-repo host files; `all` additionally reads the opt-in user-home
 * config that lives OUTSIDE the workspace containment boundary.
 */
export type THostInstructionScope = 'repo' | 'all';

/** One entry in the hand-maintained scan-surface table. */
export interface IHostFileTarget {
	/**
	 * The file path. For `in-repo` targets this is workspace-relative
	 * (`AGENTS.md`); for `user-home` targets it is relative to the
	 * user's home directory (`.cursorrules`).
	 */
	readonly path: string;
	readonly surface: THostInstructionSurface;
}

/** One captured host-instruction file. */
export interface IHostInstructionFile {
	/**
	 * The display path: workspace-relative for `in-repo`, `~/`-prefixed
	 * for `user-home` (so the emitted proposal is unambiguous).
	 */
	readonly path: string;
	readonly surface: THostInstructionSurface;
	/** True when the file existed and was readable. */
	readonly present: boolean;
	/**
	 * True when the file is ALREADY managed by delendai (it carries
	 * the `<!-- delendai:begin -->` / `end` markers). Canonical files
	 * are skipped in the audit — there is nothing foreign to review.
	 * User-home files are never canonical (they are foreign config).
	 */
	readonly canonical: boolean;
	/** The full file content (verbatim), or '' when absent. */
	readonly content: string;
}

/**
 * The deterministic scan result. `totalNonCanonical` counts files that
 * are `present` and NOT `canonical` — i.e. the files with content worth
 * auditing. When it is zero the tool declines to emit a proposal.
 */
export interface IHostInstructionsInventory {
	readonly scope: THostInstructionScope;
	readonly files: readonly IHostInstructionFile[];
	readonly totalNonCanonical: number;
}

/**
 * A read-only seam over the user's home directory. Injected into
 * `scanHostInstructions` so the pure scanner never touches `node:fs`
 * or `os.homedir()` directly (AGENTS.md invariant). The real adapter
 * (`createUserHomeReader`) is wired at the composition edge and is
 * gated behind `scope: 'all'`; when absent, a `scope: 'all'` scan
 * degrades gracefully to "user-home files not present".
 */
export interface IUserHomeReader {
	/**
	 * Reads a file relative to the user's home directory. Returns
	 * `undefined` when the file is absent or unreadable — never throws.
	 * The path comes from the hand-maintained {@link IHostFileTarget}
	 * table, so it is always an allow-listed, traversal-free literal.
	 */
	readHome(relativeToHome: string): Promise<string | undefined>;
}
