/**
 * bridge.constant.ts — b00239 S3.
 *
 * The constants that pin down the workspace-local legacy bridge:
 *
 *   - `BRIDGE_MARKER` is the single in-file signature the installer
 *     writes into every shim it emits, so a later `remove` can prove
 *     the file is ours and refuse to delete anything it cannot prove.
 *     A bridge shim that cannot be proven ours is treated as foreign
 *     for the same reason `alias.interface.ts` treats an alias that
 *     cannot be proven ours as foreign: the failure mode of guessing
 *     wrong is deleting a file the tool did not create.
 *
 *   - `BRIDGE_DIR_NAME` is the workspace-relative directory the
 *     installer creates. Choosing a name already prefixed with
 *     `scripts/legacy-bridge/` makes the intent obvious in `ls` and
 *     in code review, so a project maintainer who has never run
 *     `delendai bridge install` understands on sight what the
 *     directory is for and what should re-create it. The directory
 *     is workspace-local on purpose (NOT under `.bin/` or
 *     `<prefix>/bin/`): a workspace bridge is meant to live inside
 *     the project, version-controlled or gitignored per the
 *     project's policy, and never subject to a package manager's
 *     install hook.
 *
 *   - `BRIDGE_LEGACY_BINARIES` is the closed list of legacy bin
 *     names a workspace bridge might rewrite. New names append; old
 *     names stay until the project publishes a "legacy phase 2"
 *     notice — there is no automatic eviction, because a project
 *     that has been auto-migrated does not know what bridges still
 *     address the old names and silently dropping support breaks
 *     tools the user never inspected.
 *
 *   - `BRIDGE_CANONICAL_BIN` is the one constant that needs to match
 *     `version.constant.ts#CLI_BINARY_NAMES`'s new canonical name;
 *     if those two diverge the bridge will re-exec a non-CLI binary
 *     which is exactly the failure mode this slice forbids.
 */

export const BRIDGE_MARKER =
	'# delendai-legacy-bridge:v1 — auto-installed by `delendai bridge install`';

export const BRIDGE_DIR_NAME = 'scripts/legacy-bridge';

export const BRIDGE_README_NAME = 'README.md';

export const BRIDGE_LEGACY_BINARIES = ['mcp-vertex', 'mcpv'] as const;

export const BRIDGE_CANONICAL_BIN = 'delendai';

export type IBridgeLegacyBinary = (typeof BRIDGE_LEGACY_BINARIES)[number];
