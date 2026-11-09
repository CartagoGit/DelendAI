/**
 * token.ts — signed confirmation tokens (CRITICAL I5).
 *
 * A spend path (`api` / `cli`) must never execute without the USER's
 * explicit consent for THAT specific hop. The runner emits an MCP
 * `elicitation` (or a CLI prompt); when the user approves, the runner —
 * server-side — mints an HMAC-signed token bound to the invocation id,
 * the provider id, and the estimated cost tier. The token is verified
 * before the subprocess/HTTP call fires.
 *
 * Why HMAC and not a boolean flag: the secret lives only in the runner
 * process. The LLM never sees it, so the LLM CANNOT mint its own token — it
 * can only ask the runner to prompt the user. A replayed token from a
 * different invocation, provider, or cost tier fails verification because
 * all three are part of the signed payload (a00085 #5).
 */
import {
	createConsentSigner,
	type IConsentSigner,
} from '@delendai/core/runtime';

export interface IConfirmationSpend {
	readonly invocationId: string;
	readonly providerId: string;
	readonly estimatedCostTier: number;
}

const spendPayload = (spend: IConfirmationSpend): string =>
	`${spend.invocationId}\0${spend.providerId}\0${spend.estimatedCostTier}`;

/** Mints + verifies tokens bound to an invocation hop (id + provider + tier). */
export class ConfirmationSigner {
	private readonly signer: IConsentSigner;

	constructor(secret?: Buffer) {
		// A fresh per-process secret by default: tokens never survive a
		// restart and are never derivable by anything outside this process.
		this.signer = createConsentSigner(secret, 'otk_');
	}

	/** Mint a token that authorises exactly this spend hop. */
	mint(spend: IConfirmationSpend): string {
		return this.signer.issue(spendPayload(spend));
	}

	/** Constant-time check that `token` authorises this spend hop. */
	verify(token: string, spend: IConfirmationSpend): boolean {
		return this.signer.verify(token, spendPayload(spend));
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
