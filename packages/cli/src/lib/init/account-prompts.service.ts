/**
 * account-prompts.service.ts — the questions the offer of accounts asks,
 * the same in `delendai accounts offer` and at the end of `init`, in the
 * person's language: each account is a numbered card that says what it
 * is and where it was seen, then one question about it.
 */
import type {
	IAccountClassification,
	IAccountFinding,
	IOfferPosition,
	IProviderAccount,
} from '@delendai/core/contracts';
import { classificationFromAnswer } from '@delendai/core/cli';

import {
	OFFER_LANGS,
	OFFER_LANGUAGE_NAMES,
	OFFER_MESSAGES,
} from '../../contracts/constants/offer-messages.constant';
import type { IQuestionPrompt } from '../../contracts/interfaces/init-offer.interface';
import type {
	IOfferLang,
	IOfferMessages,
} from '../../contracts/interfaces/offer-messages.interface';
import {
	cardWidth,
	modelsLine,
	offerCard,
	offerSection,
} from './offer-card.service';
import { ask, askChoice, askConfirmOrStop } from './init-prompts.service';

/** Questions sit under the cards they ask about. */
const QUESTION_INDENT = '  ';

type IPaid = IAccountClassification['billingMode'] | 'skip';

const PAID: readonly IPaid[] = [
	'subscription-included',
	'prepaid-token-plan',
	'pay-as-you-go',
	'local',
	'skip',
];

/** What a card says about a finding beyond its title. */
const detailsOf = (
	messages: IOfferMessages,
	finding: IAccountFinding,
): readonly string[] =>
	[
		finding.credentialEnv === undefined
			? undefined
			: messages.variableNote(finding.credentialEnv),
		modelsLine(messages, finding.models),
	].filter((line): line is string => line !== undefined);

/** Which language to speak, asked in every language it speaks. */
export const askLanguage = async (rl: IQuestionPrompt): Promise<IOfferLang> => {
	process.stderr.write(
		offerSection(
			OFFER_LANGS.map(
				(lang) => OFFER_MESSAGES[lang].languageQuestion,
			).join(' / '),
		),
	);
	return askChoice(
		rl,
		'Language / Idioma',
		OFFER_LANGS.map((lang) => ({
			label: OFFER_LANGUAGE_NAMES[lang],
			value: lang,
		})),
		'en',
	);
};

/**
 * The offer's questions, asked on `rl`. `q` at any of them stops the rest:
 * what was answered is kept, and every later question answers "not asked".
 */
export const accountPromptsOn = (
	rl: IQuestionPrompt,
	/** Called before every question: the live progress line is cleared. */
	beforeAsking: () => void = () => undefined,
	messages: IOfferMessages = OFFER_MESSAGES.en,
	width: number = cardWidth(process.stderr.columns),
) => {
	let stopped = false;
	const say = (text: string): void => {
		process.stderr.write(`${text}\n`);
	};
	const confirm = async (
		question: string,
		fallback: boolean,
	): Promise<boolean | undefined> => {
		if (stopped) return undefined;
		beforeAsking();
		const answer = await askConfirmOrStop(
			rl,
			`${QUESTION_INDENT}${question}`,
			fallback,
			messages.yesNo,
		);
		if (answer !== 'stop') return answer;
		stopped = true;
		return undefined;
	};
	return {
		/** Whether the person stopped the questions with `q`. */
		stopped: (): boolean => stopped,
		ask: async (offer: IProviderAccount, position?: IOfferPosition) => {
			if (stopped) return undefined;
			beforeAsking();
			const finding = position?.finding;
			if (position?.index === 1)
				say(offerSection(messages.offersHeading(position.total)));
			say(
				offerCard({
					index: position?.index ?? 1,
					total: position?.total ?? 1,
					kind:
						finding === undefined
							? ''
							: messages.sources[finding.source],
					title:
						finding === undefined
							? (offer.displayName ?? offer.accountId)
							: messages.subject(finding),
					details: [
						`${messages.credentialModes[offer.credentialMode] ?? offer.credentialMode} · ${messages.billingModes[offer.billingMode] ?? offer.billingMode}`,
						...(finding === undefined
							? []
							: detailsOf(messages, finding)),
						messages.accountLine(offer.accountId),
					],
					width,
				}),
			);
			return confirm(messages.addQuestion, false);
		},
		askAutomation: async (_offer: IProviderAccount) =>
			(await confirm(messages.automationQuestion, false)) === true,
		beforeClassifying: async (count: number) => {
			if (stopped) return false;
			beforeAsking();
			say(offerSection(messages.classifyHeading(count)));
			return (
				(await confirm(messages.beforeClassifying(count), true)) ===
				true
			);
		},
		classify: async (
			finding: IAccountFinding,
			position?: IOfferPosition,
		): Promise<IAccountClassification | undefined> => {
			if (stopped) return undefined;
			beforeAsking();
			say(
				offerCard({
					index: position?.index ?? 1,
					total: position?.total ?? 1,
					kind: messages.sources[finding.source],
					title: messages.subject(finding),
					details: [
						...detailsOf(messages, finding),
						messages.suggested(finding.vendorHint),
					],
					width,
				}),
			);
			const vendor = (
				await ask(
					rl,
					`${QUESTION_INDENT}${messages.vendorQuestion}`,
					finding.vendorHint,
				)
			).trim();
			if (messages.yesNo.stop.includes(vendor.toLowerCase())) {
				stopped = true;
				return undefined;
			}
			if (
				vendor.length === 0 ||
				messages.skipWords.includes(vendor.toLowerCase())
			)
				return undefined;
			const paid = await askChoice(
				rl,
				`${QUESTION_INDENT}${messages.payQuestion(vendor)}`,
				PAID.map((value) => ({
					label: messages.payment[value] ?? value,
					value,
				})),
				'skip',
			);
			return paid === 'skip'
				? undefined
				: classificationFromAnswer(finding, vendor, paid);
		},
	};
};
