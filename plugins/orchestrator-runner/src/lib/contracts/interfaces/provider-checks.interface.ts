/**
 * provider-checks.interface.ts — what a provider's client said when the
 * healthcheck asked it.
 */
import type { IClientVerdict } from '@delendai/core/contracts';

/** What a client said when asked, for a provider whose CLI is installed. */
export interface IProviderChecks {
	/** Its own answer on whether it can work now; `unknown` when it could not be asked. */
	readonly verdict?: IClientVerdict | undefined;
	readonly authTier?: string | null | undefined;
	/** The models it says it reaches, when it lists them. */
	readonly models?: readonly string[] | undefined;
}
