import {
	localizedScopeRefusalTip,
	type ConventionalHeaderRefusalCode,
} from './i18n-types';

export interface IParsedConventionalHeader {
	readonly type: string;
	readonly scope: string | undefined;
	readonly breaking: boolean;
	readonly subject: string;
	readonly rest: string;
}

export interface IConventionalHeaderRefusal {
	readonly ok: false;
	readonly code: ConventionalHeaderRefusalCode;
	readonly tip: string;
	readonly raw: string;
}

export interface IConventionalHeaderSuccess {
	readonly ok: true;
	readonly value: IParsedConventionalHeader;
}

export type IConventionalHeaderParseResult =
	| IConventionalHeaderRefusal
	| IConventionalHeaderSuccess;

export type IScopedMessageBuildResult =
	| IConventionalHeaderRefusal
	| {
			readonly ok: true;
			readonly value: string;
	  };

export interface IBuildScopedMessageOptions {
	readonly defaultScope: string;
	readonly locale?: string | undefined;
}

const HEADER_PATTERN =
	/^([A-Za-z][A-Za-z0-9_.-]*)(?:\(([^()\r\n]+)\))?(!)?:\s+(.+)$/u;
const hasControlChars = (value: string): boolean =>
	Array.from(value).some((char) => {
		const codePoint = char.codePointAt(0);
		return (
			codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
		);
	});

const normalizeMessage = (raw: string): string => raw.replace(/\r\n?/gu, '\n');

const refusal = (
	raw: string,
	locale: string | undefined,
	code: ConventionalHeaderRefusalCode,
): IConventionalHeaderRefusal => ({
	ok: false,
	code,
	tip: localizedScopeRefusalTip(locale, code),
	raw,
});

export const parseHeader = (
	raw: string,
	locale?: string | undefined,
): IConventionalHeaderParseResult => {
	const normalized = normalizeMessage(raw);
	const newlineIndex = normalized.indexOf('\n');
	const firstLine =
		newlineIndex === -1 ? normalized : normalized.slice(0, newlineIndex);
	if (firstLine.trim().length === 0) {
		return refusal(raw, locale, 'EMPTY_HEADER');
	}
	if (hasControlChars(firstLine)) {
		return refusal(raw, locale, 'MALFORMED_HEADER');
	}
	const match = HEADER_PATTERN.exec(firstLine);
	if (match === null) {
		return refusal(raw, locale, 'MALFORMED_HEADER');
	}
	const type = match[1] ?? '';
	const scope = match[2];
	const bang = match[3];
	const subject = match[4] ?? '';
	const trailing =
		newlineIndex === -1 ? '' : normalized.slice(newlineIndex + 1);
	return {
		ok: true,
		value: {
			type,
			scope,
			breaking: bang === '!',
			subject,
			rest: trailing.length === 0 ? subject : `${subject}\n${trailing}`,
		},
	};
};

export const buildScopedMessage = (
	raw: string,
	options: IBuildScopedMessageOptions,
): IScopedMessageBuildResult => {
	const parsed = parseHeader(raw, options.locale);
	if (!parsed.ok) {
		return parsed;
	}
	if (parsed.value.scope !== undefined) {
		return {
			ok: true,
			value: raw,
		};
	}
	const bang = parsed.value.breaking ? '!' : '';
	return {
		ok: true,
		value: `${parsed.value.type}(${options.defaultScope})${bang}: ${parsed.value.rest}`,
	};
};
