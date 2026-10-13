/** The host binary the SSH adapter drives. */
export const SSH_BINARY = 'ssh';

/** Seconds between keepalive probes on an idle connection. */
export const SSH_DEFAULT_KEEPALIVE_INTERVAL_SEC = 30;

/** Unanswered probes before the connection is declared dead. */
export const SSH_DEFAULT_KEEPALIVE_COUNT_MAX = 4;

/** A host or user must start with a character that cannot be an option. */
export const SSH_TARGET_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.@:%-]*$/;

/** An environment variable name that is safe to put in a script. */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * PowerShell treats these typographic quotes as the ASCII single quote,
 * so inside a single-quoted string each must be doubled as well.
 */
export const POWERSHELL_QUOTE_CHARACTERS = /['‘’‚‛]/g;

/** Reads standard input to the path held in the DELENDAI_REMOTE_PATH variable. */
export const POWERSHELL_WRITE_SCRIPT =
	'New-Item -ItemType Directory -Force -Path (Split-Path -LiteralPath $env:DELENDAI_REMOTE_PATH) | Out-Null; [Console]::In.ReadToEnd() | Set-Content -LiteralPath $env:DELENDAI_REMOTE_PATH -NoNewline';

/** Writes the file named by DELENDAI_REMOTE_PATH to standard output. */
export const POWERSHELL_READ_SCRIPT =
	'Get-Content -LiteralPath $env:DELENDAI_REMOTE_PATH -Raw';

/** The variable the file scripts read their path from. */
export const REMOTE_PATH_VARIABLE = 'DELENDAI_REMOTE_PATH';

/** Highest TCP port number. */
export const MAX_TCP_PORT = 65_535;
