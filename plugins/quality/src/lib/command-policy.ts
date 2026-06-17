/**
 * Command allow/deny policy for the quality runner (M13).
 *
 * `run_quality` executes commands sourced from the host config. That is a
 * trust boundary: a host that exposes the quality plugin to a less-trusted
 * agent may want to restrict WHICH binaries can be spawned. This policy is the
 * agnostic mechanism — pure, opt-in, and enforced before any `spawn`. With no
 * policy the behaviour is unchanged (the commands are the host's own).
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
 * Decide whether a command may run. Deny wins over allow; an empty/absent
 * allow list means "any binary not denied".
 */
export const evaluateCommandPolicy = (
	command: string,
	policy?: ICommandPolicy
): IPolicyVerdict => {
	if (policy === undefined) return { allowed: true };
	const bin = commandBinary(command);
	if (policy.deny?.includes(bin)) {
		return { allowed: false, reason: `command "${bin}" is in the deny list` };
	}
	if (policy.allow && policy.allow.length > 0 && !policy.allow.includes(bin)) {
		return {
			allowed: false,
			reason: `command "${bin}" is not in the allow list`,
		};
	}
	return { allowed: true };
};
