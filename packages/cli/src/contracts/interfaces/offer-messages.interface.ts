/**
 * offer-messages.interface.ts — every sentence the offer of accounts says
 * to a person, so each language says all of them.
 */
import type {
	IAccountFinding,
	IAccountSource,
	IClientVerdict,
	IOfferStep,
} from '@delendai/core/contracts';

/** The languages the offer of accounts speaks. */
export type IOfferLang = 'en' | 'es';

/** The words a yes/no question takes and shows. */
export interface IYesNoWords {
	readonly yes: readonly string[];
	readonly no: readonly string[];
	readonly stop: readonly string[];
	/** `(y/n, q to stop)`. */
	readonly hint: (stoppable: boolean) => string;
	readonly fallbackKey: (fallback: boolean) => string;
	readonly retry: (answer: string, stoppable: boolean) => string;
	readonly tooMany: (fallback: string) => string;
}

export interface IOfferMessages {
	readonly lang: IOfferLang;
	readonly title: string;
	readonly intro: string;
	readonly steps: Readonly<Record<IOfferStep, string>>;
	readonly asking: (clients: string, elapsed: string) => string;
	readonly verdicts: Readonly<Record<IClientVerdict | 'unknown', string>>;
	readonly sources: Readonly<Record<IAccountSource, string>>;
	/** The finding in one line: what it is, and where it was seen. */
	readonly subject: (finding: IAccountFinding) => string;
	readonly models: (shown: string, more: number) => string;
	readonly variableNote: (variable: string) => string;
	readonly credentialModes: Readonly<Record<string, string>>;
	readonly billingModes: Readonly<Record<string, string>>;
	readonly offersHeading: (count: number) => string;
	readonly classifyHeading: (count: number) => string;
	readonly accountLine: (accountId: string) => string;
	readonly addQuestion: string;
	readonly automationQuestion: string;
	readonly beforeClassifying: (count: number) => string;
	readonly suggested: (vendor: string) => string;
	readonly vendorQuestion: string;
	readonly skipWords: readonly string[];
	readonly payQuestion: (vendor: string) => string;
	readonly payment: Readonly<Record<string, string>>;
	readonly yesNo: IYesNoWords;
	readonly summaryHeading: string;
	readonly added: string;
	readonly declined: string;
	readonly notAsked: string;
	readonly yourFile: string;
	readonly none: string;
	readonly notAskedHint: string;
	readonly automationHint: string;
	readonly stopped: string;
	readonly nothingFound: string;
	readonly languageQuestion: string;
	readonly languageSaved: (code: string) => string;
}
