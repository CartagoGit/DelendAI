/**
 * language.command.ts — `delendai language [<code>]`: which language
 * delendai speaks to you, and the choice that keeps it.
 *
 * Without a code it says what it speaks now and why; with one it saves
 * the choice in your own delendai files, read before the system locale.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { OFFER_LANGUAGE_NAMES } from '../contracts/constants/offer-messages.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { data } from '../lib/helpers/cli-command.helper';
import {
	languagePath,
	localeLanguage,
	readSavedLanguage,
	saveLanguage,
} from '../lib/cli-language.service';

const USAGE = 'language [<code>]';

const CODE_PATTERN = /^[a-z]{2,3}$/u;

export const languageCommand: ICliCommand = {
	name: 'language',
	offline: true,
	summary: 'Show or choose the language delendai speaks to you.',
	usage: USAGE,
	run: async (args, ctx) => {
		const path = languagePath();
		const [code] = args;
		if (code === undefined) {
			return data({
				current: ctx.globals.lang,
				saved: (await readSavedLanguage(path)) ?? null,
				locale: localeLanguage(process.env) ?? null,
				path,
				available: OFFER_LANGUAGE_NAMES,
			});
		}
		const lang = code.toLowerCase();
		if (!CODE_PATTERN.test(lang))
			return {
				code: EXIT_CODE.USAGE,
				error: `usage: delendai ${USAGE} (a language code such as en or es)`,
			};
		await saveLanguage(lang, path);
		return data({ saved: lang, path });
	},
};
