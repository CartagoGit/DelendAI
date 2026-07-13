/**
 * token.ts — signed confirmation tokens (CRITICAL I5).
 *
 * A spend path (`api` / `cli`) must never execute without the USER's
 * explicit consent for THAT specific invocation. The runner emits an MCP
 * `elicitation` (or a CLI prompt); when the user approves, the runner —
 * server-side — mints an HMAC-signed token bound to the invocation id. The
 * token is verified before the subprocess/HTTP call fires.
 *
 * Why HMAC and not a boolean flag: the secret lives only in the runner
 * process. The LLM never sees it, so the LLM CANNOT mint its own token — it
 * can only ask the runner to prompt the user. A replayed token from a
 * different invocation fails verification because the invocation id is part
 * of the signed payload.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Mints + verifies tokens bound to an invocation id. */
export class ConfirmationSigner {
	private readonly secret: Buffer;

	constructor(secret?: Buffer) {
		// A fresh per-process secret by default: tokens never survive a
		// restart and are never derivable by anything outside this process.
		this.secret = secret ?? randomBytes(32);
	}

	/** Mint a token that authorises exactly `invocationId`. */
	mint(invocationId: string): string {
		const mac = createHmac('sha256', this.secret)
			.update(invocationId)
			.digest('hex');
		return `otk_${mac}`;
	}

	/** Constant-time check that `token` authorises `invocationId`. */
	verify(token: string, invocationId: string): boolean {
		const expected = this.mint(invocationId);
		if (token.length !== expected.length) return false;
		try {
			return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
		} catch {
			return false;
		}
	}
}

/**
 * The confirmation seam the {@link InvocationManager} calls before a spend.
 * The host wires the real MCP `elicitation` here; when the user approves it
 * returns a token minted by the runner's {@link ConfirmationSigner}. A `null`
 * return means the user declined (or no host prompt is wired) → no spend.
 */
export interface IConfirmationGate {
	confirm(input: {
		readonly invocationId: string;
		readonly providerId: string;
		readonly estimatedCostTier: number;
	}): Promise<string | null>;
}

/**
 * The default gate: DENIES every spend. A runner with no host elicitation
 * wired must not spend the user's money — the safe default is "no". Hosts
 * replace this with an elicitation-backed gate.
 */
export const denyAllConfirmationGate: IConfirmationGate = {
	confirm: () => Promise.resolve(null),
};
