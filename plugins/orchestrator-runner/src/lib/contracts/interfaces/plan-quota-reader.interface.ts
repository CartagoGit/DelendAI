/**
 * plan-quota-reader.interface.ts — a vendor tool that says what is left
 * of a plan before anything is spent on it.
 */

/** The output formats a reader is parsed with. */
export type IPlanQuotaFormat = 'mmx-model-remains';

/** One vendor's plan-quota command. Never a credential, never a value of it. */
export interface IPlanQuotaReader {
	/** The account `vendor` it reads for. */
	readonly vendor: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly format: IPlanQuotaFormat;
}

/** Runs a reader in an account's environment; the output is all it returns. */
export type IPlanQuotaRunner = (
	command: string,
	args: readonly string[],
	env: Readonly<Record<string, string>> | undefined,
	timeoutMs: number,
) => Promise<{ readonly code: number; readonly output: string }>;
