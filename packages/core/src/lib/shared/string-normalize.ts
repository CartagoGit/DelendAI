const isAsciiLowerOrDigit = (char: string): boolean => {
	const code = char.charCodeAt(0);
	return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
};

export const toKebabCase = (value: string): string => {
	const normalized = value.trim().toLowerCase();
	let out = '';
	let pendingDash = false;
	for (const char of normalized) {
		if (isAsciiLowerOrDigit(char)) {
			if (pendingDash && out.length > 0) out += '-';
			out += char;
			pendingDash = false;
			continue;
		}
		pendingDash = out.length > 0;
	}
	return out;
};

export const stripPackageScope = (value: string): string => {
	if (!value.startsWith('@')) return value;
	const slashIndex = value.indexOf('/');
	return slashIndex === -1 ? value : value.slice(slashIndex + 1);
};

export const trimTrailingChar = (value: string, char: string): string => {
	let end = value.length;
	while (end > 0 && value[end - 1] === char) end -= 1;
	return end === value.length ? value : value.slice(0, end);
};
