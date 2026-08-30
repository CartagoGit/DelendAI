import {
	localizedScopeRefusalTip,
	type ConventionalHeaderRefusalCode,
} from './i18n-types';

export interface IParsedConventionalHeader {
	readonly type: string;
	readonly scope: string | undefined;
	readonly breaking: boolean;
	readonly subject: string;
	/** Original suffix after the subject line, including newline separators. */
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

const splitHeader = (
	raw: string,
): {
	readonly firstLine: string;
	readonly separator: string;
	readonly trailing: string;
} => {
	const lfIndex = raw.indexOf('\n');
	if (lfIndex !== -1) {
		const hasCarriageReturn = lfIndex > 0 && raw[lfIndex - 1] === '\r';
		return {
			firstLine: hasCarriageReturn
				? raw.slice(0, lfIndex - 1)
				: raw.slice(0, lfIndex),
			separator: hasCarriageReturn ? '\r\n' : '\n',
			trailing: raw.slice(lfIndex + 1),
		};
	}

	const crIndex = raw.indexOf('\r');
	if (crIndex !== -1) {
		return {
			firstLine: raw.slice(0, crIndex),
			separator: '\r',
			trailing: raw.slice(crIndex + 1),
		};
	}

	return {
		firstLine: raw,
		separator: '',
		trailing: '',
	};
};

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
	const { firstLine, separator, trailing } = splitHeader(raw);
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
	return {
		ok: true,
		value: {
			type,
			scope,
			breaking: bang === '!',
			subject,
			rest: separator.length === 0 ? '' : `${separator}${trailing}`,
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
		value: `${parsed.value.type}(${options.defaultScope})${bang}: ${parsed.value.subject}${parsed.value.rest}`,
	};
};
