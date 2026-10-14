/**
 * shim-templates.ts — b00239 S3.
 *
 * The text bodies the bridge installer writes, one per platform. Kept
 * as pure functions (no IO, no node:*) so the body itself is unit-testable
 * — the four "what does the shim look like?" cases all live in
 * `bridge-installer.spec.ts` without touching disk.
 *
 * ## Why the shim does NOT call `runLegacyBridge` directly
 *
 * `runLegacyBridge` is a TypeScript export; the shim is a shell script,
 * so a direct call would mean bundling a JS entry per shim and shipping
 * two binaries (one for each legacy name) per install — which is the
 * "two implementations of the same product" failure mode this slice
 * forbids.
 *
 * The shim, instead, looks up the canonical `delendai` on the PATH the
 * user installed it with and re-execs it. That is enough: the canonical
 * `delendai` already runs `ensureMigrated` at the top of its entrypoint
 * (S2), so the migration guard runs once per invocation regardless of
 * whether the user typed `delendai …`, `delendai …`, or `delendai …`.
 *
 * ## Why the Windows bridge ships two shims
 *
 * The same reason `alias-manager.ts` does: `cmd.exe` only finds `.cmd`
 * shims, PowerShell scripts that invoke the bare name find `.ps1` if
 * `PATHEXT` is respected, and a workspace that picked one shell must
 * not silently break when the user opens the other. Both are written.
 */

import {
	BRIDGE_CANONICAL_BIN,
	BRIDGE_MARKER,
} from '../../contracts/constants/bridge.constant';

export interface IShimContext {
	/** The legacy bin name the shim is rendering for. */
	readonly legacyName: string;
	/** Absolute path of the canonical runtime; defaults to looking it up via PATH. */
	readonly canonical: string;
}

/**
 * The POSIX bridge shim body.
 *
 * Layout:
 *
 *   - shebang so the shim runs from any POSIX shell that honours
 *     the executable bit;
 *   - the marker as the first comment so `state: 'ours'` survives a
 *     shell that elides shebangs on read;
 *   - `command -v <canonical>` so a missing install surfaces as
 *     `127` (PATH not found) — never as a successful "delegated"
 *     invocation that hides the actual problem;
 *   - `exec … "$@"` so argv is forwarded verbatim.
 *
 * The shell is `sh`, not `bash`, on purpose: it runs everywhere the
 * user could plausibly have invoked a CLI binary, including the
 * minimal Alpine/CI containers that strip bash.
 */
export const POSIX_BRIDGE_SHIM_BODY = (ctx: IShimContext): string =>
	[
		'#!/bin/sh',
		BRIDGE_MARKER,
		``,
		`# Bridge for legacy bin name "${ctx.legacyName}" -> canonical ${BRIDGE_CANONICAL_BIN}.`,
		'# Forward argv verbatim. The canonical CLI runs the migration guard',
		'# (b00239 S2) at its own entrypoint, so calling it via this shim',
		'# is exactly equivalent to calling it directly.',
		'set -e',
		``,
		`if ! command -v ${BRIDGE_CANONICAL_BIN} >/dev/null 2>&1; then`,
		`  echo "delendai bridge: '${BRIDGE_CANONICAL_BIN}' not found on PATH." >&2`,
		`  echo "Install @delendai/cli, then re-run \`delendai bridge status\`." >&2`,
		'  exit 127',
		'fi',
		`exec "${BRIDGE_CANONICAL_BIN}" "$@"`,
		'',
	].join('\n');

/**
 * The Windows `.cmd` bridge shim body.
 *
 * Uses CRLF line endings on purpose: without them the file round-
 * trips through PowerShell's stream writer OK but trips the
 * `Process` rediscovery layer in `cmd.exe` on some Windows
 * versions, leaving the user with a shim that "exists but does
 * nothing".
 *
 * `${DELENDAI_CLI_BIN}` is the user's escape hatch for `delendai` is
 * not on PATH (a corporate CI runner, an office install that uses
 * `nvm`/scoop). Path lookup via `where delendai` is the normal path;
 * the env var exists only so a workspace that has a known install
 * prefix can point there explicitly.
 */
export const WINDOWS_CMD_BRIDGE_SHIM_BODY = (ctx: IShimContext): string =>
	[
		'@echo off',
		`rem ${BRIDGE_MARKER.slice(2)}`,
		`rem Bridge for legacy bin "${ctx.legacyName}" to canonical delendai.`,
		'',
		'where delendai >nul 2>nul',
		'if errorlevel 1 (',
		'  if "%DELENDAI_CLI_BIN%"=="" (',
		'    echo delendai bridge: "delendai" not found on PATH and DELENDAI_CLI_BIN is unset. 1>&2',
		'    exit /b 127',
		'  )',
		'  "%DELENDAI_CLI_BIN%" %*',
		'  exit /b %ERRORLEVEL%',
		')',
		'delendai %*',
		'',
	].join('\r\n');

/**
 * The Windows `.ps1` bridge shim body.
 *
 * PowerShell respects `PATHEXT` when the bare name is invoked, but
 * shipping `.ps1` is still the cheapest way to cover callers who
 * pre-resolve the script path: it costs one file, it never
 * conflicts with the `.cmd` shim because PowerShell's script
 * resolution prefers the extension the caller asked for, and the
 * marker lets the installer's recogniser find both at the same
 * state.
 */
export const WINDOWS_PS1_BRIDGE_SHIM_BODY = (ctx: IShimContext): string =>
	[
		BRIDGE_MARKER.slice(2),
		'# Bridge for legacy bin "' +
			ctx.legacyName +
			'" to canonical delendai.',
		'',
		'$canonical = $env:DELENDAI_CLI_BIN',
		'if (-not $canonical) {',
		"  $candidate = (Get-Command 'delendai' -ErrorAction SilentlyContinue)",
		'  if ($candidate) { $canonical = $candidate.Path }',
		'}',
		'if (-not $canonical) {',
		'  Write-Error "delendai bridge: cannot find canonical delendai on PATH and DELENDAI_CLI_BIN is unset."',
		'  exit 127',
		'}',
		'& $canonical @args',
		'exit $LASTEXITCODE',
		'',
	].join('\n');

/**
 * The README the installer writes at the root of the bridge
 * directory. Same rule as the alias-manager's "explain a refusal
 * inline" rule applies: a feature the user has never seen cannot
 * expect them to read a doc page, so the directory itself explains
 * what it is, what each script does, and what to do when one of the
 * scripts starts failing.
 */
export const BRIDGE_README_BODY = (
	canonical: string,
): string => `# scripts/legacy-bridge

Generated by \`delendai bridge install\`. Each file in this directory is a
short shim that re-execs the canonical \`${canonical}\` CLI without
reimplementing it. They exist so a workspace whose scripts, CI or
Dockerfile still invokes a legacy bin name keeps working while the
project catches up to the new identity.

- \`delendai\`, \`delendai\`: POSIX shims. \`chmod +x\` is applied
  automatically on install; the bodies look up \`${canonical}\` on
  \`PATH\` (\`DELENDAI_CLI_BIN\` overrides when set).
- \`delendai.cmd\`, \`delendai.cmd\` (and the \`.ps1\` siblings, on
  Windows): the equivalent shims for \`cmd.exe\` / PowerShell.

To use them, add \`./scripts/legacy-bridge\` to \`PATH\` (per-shell; do
NOT symlink them into \`/usr/local/bin\` — see \`docs/delendai/wiki/
migration-to-delendai.md\` for why), or invoke them by absolute path
from CI / scripts.

To uninstall: \`delendai bridge remove\`. It only removes files marked
with this tool's marker — anything else in the directory is left
untouched.
`;
