/**
 * install-provider.ts — explicit, argv-only installation of known CLIs.
 *
 * The tool layer supplies the consent flag. This service accepts only a
 * provider id from the immutable catalogue and invokes its fixed argv: user
 * input never reaches a shell command.
 */
import type { IRunArgvOutcome } from '@delendai/core/public';

import { KNOWN_CLIS } from '../contracts/constants/known-providers.constant';

export type IInstallRunner = (
	argv: readonly [string, ...string[]],
) => Promise<IRunArgvOutcome>;

export interface IProviderInstallResult {
	readonly providerId: string;
	readonly attempted: boolean;
	readonly ok: boolean;
	readonly code: number | null;
	readonly timedOut: boolean;
	readonly hint: string | null;
}

/** Run a trusted install argv only when the caller has explicitly opted in. */
export const installKnownCli = async (
	providerId: string,
	run: IInstallRunner,
): Promise<IProviderInstallResult> => {
	const provider = KNOWN_CLIS.find(
		(candidate) => candidate.id === providerId,
	);
	if (provider === undefined) {
		return {
			providerId,
			attempted: false,
			ok: false,
			code: null,
			timedOut: false,
			hint: null,
		};
	}
	const result = await run(provider.installArgv);
	return {
		providerId,
		attempted: true,
		ok: result.code === 0 && !result.timedOut,
		code: result.code,
		timedOut: result.timedOut,
		hint: provider.installHint,
	};
};
