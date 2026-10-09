/** What a hidden value is shown as. */
export const REDACTED_VALUE = '[redacted]';

/**
 * Names that suggest the value is a credential. Matched anywhere in the
 * name, case-insensitively: `GITHUB_TOKEN`, `db_password` and `AWS_SECRET_ACCESS_KEY`
 * all hide, `PATH` and `HOME` do not.
 */
export const SECRET_NAME_PATTERN =
	/(token|secret|passw(or)?d|passphrase|credential|api[_-]?key|private[_-]?key|auth|cookie|session)/i;

/** Names that look secret by accident and are safe to show. */
export const DEFAULT_ALLOWED_ENV_NAMES: readonly string[] = [
	'SSH_AUTH_SOCK',
	'GPG_TTY',
];
