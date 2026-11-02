/**
 * cli-language.service.ts — which language delendai speaks to a person.
 *
 * `--lang` first, then `DELENDAI_LANG`, then the choice saved with
 * `delendai language <code>`, then the system locale (`LC_ALL`,
 * `LC_MESSAGES`, `LANG`, `LANGUAGE`). `C` and `POSIX` name no language,
 * so a machine set to `C.UTF-8` has none: an interactive command then
 * asks once and saves the answer, everything else speaks English.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { thisUserConfigRoot } from '@delendai/core/cli';

const NO_LANGUAGE = new Set(['c', 'posix']);

/** Where the chosen language is kept, beside the person's other delendai files. */
export const languagePath = (root: string = thisUserConfigRoot()): string =>
	join(root, 'delendai', 'language.json');

/** `es_ES.UTF-8` → `es`; `C.UTF-8` and an empty value name no language. */
export const languageOfLocale = (
	locale: string | undefined,
): string | undefined => {
	const code = /^[A-Za-z]+/u
		.exec(locale?.split(':')[0] ?? '')?.[0]
		?.toLowerCase();
	return code === undefined || NO_LANGUAGE.has(code) ? undefined : code;
};

/** The system locale's language, by the order POSIX reads them. */
export const localeLanguage = (
	env: Readonly<Record<string, string | undefined>>,
): string | undefined =>
	[env.LC_ALL, env.LC_MESSAGES, env.LANG, env.LANGUAGE]
		.map(languageOfLocale)
		.find((code) => code !== undefined);

/** The saved choice; nothing when none was saved or the file is unreadable. */
export const readSavedLanguage = async (
	path: string = languagePath(),
): Promise<string | undefined> => {
	const text = await readFile(path, 'utf8').catch(() => undefined);
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		const lang =
			parsed !== null && typeof parsed === 'object' && 'lang' in parsed
				? parsed.lang
				: undefined;
		return typeof lang === 'string' && lang.length > 0 ? lang : undefined;
	} catch {
		return undefined;
	}
};

/** Keep `lang` as the person's choice. */
export const saveLanguage = async (
	lang: string,
	path: string = languagePath(),
): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ lang }, null, '\t')}\n`);
};

/**
 * The language to speak when no `--lang` was given; `undefined` when
 * nothing names one, so a command that can ask knows it should.
 */
export const cliLanguage = async (
	env: Readonly<Record<string, string | undefined>> = process.env,
	path: string = languagePath(),
): Promise<string | undefined> => {
	const declared = env.DELENDAI_LANG?.trim();
	if (declared !== undefined && declared.length > 0) return declared;
	return (await readSavedLanguage(path)) ?? localeLanguage(env);
};
