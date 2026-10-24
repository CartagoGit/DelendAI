/**
 * init-offer.interface.ts — what offering the accounts found at the end of
 * `init` needs from the terminal and the flow.
 */
import type { offerFoundAccounts } from '@delendai/core/cli';

/** What the offer needs from the terminal and the flow; specs pass their own. */
export interface IInitOfferDeps {
	readonly interactive: () => boolean;
	readonly open: () => IClosablePrompt;
	readonly offer: typeof offerFoundAccounts;
	readonly report: (line: string) => void;
	/** Where the live progress goes (stderr). */
	readonly stream: IOfferProgressStream;
}

/** The one call a yes/no question makes of a prompt line. */
export interface IQuestionPrompt {
	question(query: string, answer: (text: string) => void): void;
}

/** A prompt line that is closed once the questions are asked. */
export interface IClosablePrompt extends IQuestionPrompt {
	close(): void;
}

/** Where the offer's progress goes: a terminal gets a live line. */
export interface IOfferProgressStream {
	readonly isTTY?: boolean | undefined;
	write(text: string): unknown;
}
