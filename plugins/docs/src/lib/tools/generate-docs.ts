export interface IGeneratedDocFile {
	readonly path: string;
	readonly markdown: string;
}

const IDENT = '[A-Za-z_$][A-Za-z0-9_$]*';

const listMatches = (source: string, pattern: RegExp): string[] => {
	const values = new Set<string>();
	while (true) {
		const match = pattern.exec(source);
		if (match === null) break;
		const value = match[1]?.trim();
		if (value) values.add(value);
	}
	return [...values].sort((a, b) => a.localeCompare(b));
};

export const extractFileSummary = (source: string): string | undefined => {
	const block = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(source);
	if (block?.[1]) {
		const cleaned = block[1]
			.split('\n')
			.map((line) => line.replace(/^\s*\*\s?/, '').trim())
			.filter(Boolean)
			.join(' ')
			.trim();
		if (cleaned.length > 0) return cleaned;
	}
	const lines = source.split('\n');
	const summaryLines: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '') {
			if (summaryLines.length > 0) break;
			continue;
		}
		if (!trimmed.startsWith('//')) break;
		summaryLines.push(trimmed.replace(/^\/\/\s?/, ''));
	}
	return summaryLines.length > 0 ? summaryLines.join(' ') : undefined;
};

const renderSection = (
	title: string,
	items: readonly string[],
	suffix = '',
): string =>
	[
		`## ${title}`,
		items.length > 0
			? items.map((item) => `- ${item}${suffix}`).join('\n')
			: '- None',
	].join('\n');

export const generateModuleMarkdown = (
	path: string,
	source: string,
): string => {
	const exports = [
		...listMatches(
			source,
			new RegExp(
				`\\bexport\\s+(?:async\\s+)?function\\s+(${IDENT})\\b`,
				'g',
			),
		).map((name) => `${name} (function)`),
		...listMatches(
			source,
			new RegExp(`\\bexport\\s+class\\s+(${IDENT})\\b`, 'g'),
		).map((name) => `${name} (class)`),
		...listMatches(
			source,
			new RegExp(`\\bexport\\s+(?:const|let|var)\\s+(${IDENT})\\b`, 'g'),
		).map((name) => `${name} (variable)`),
		...listMatches(
			source,
			new RegExp(
				`\\bexport\\s+(?:type|interface|enum)\\s+(${IDENT})\\b`,
				'g',
			),
		).map((name) => `${name} (type)`),
	].sort((a, b) => a.localeCompare(b));
	const types = [
		...listMatches(
			source,
			new RegExp(`\\bexport\\s+interface\\s+(${IDENT})\\b`, 'g'),
		).map((name) => `${name} (interface)`),
		...listMatches(
			source,
			new RegExp(`\\bexport\\s+type\\s+(${IDENT})\\b`, 'g'),
		).map((name) => `${name} (type)`),
		...listMatches(
			source,
			new RegExp(`\\bexport\\s+enum\\s+(${IDENT})\\b`, 'g'),
		).map((name) => `${name} (enum)`),
	].sort((a, b) => a.localeCompare(b));
	const functions = listMatches(
		source,
		new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+(${IDENT})\\b`, 'g'),
	).map((name) => `${name}()`);
	const parts = [`# ${path}`];
	const summary = extractFileSummary(source);
	if (summary) parts.push('', summary);
	parts.push('', renderSection('Exports', exports));
	parts.push('', renderSection('Types', types));
	parts.push('', renderSection('Functions', functions));
	return parts.join('\n');
};

export const generateReadmeMarkdown = (
	files: readonly IGeneratedDocFile[],
): string => {
	const parts = ['# Generated Module Summary', ''];
	for (const file of files) {
		parts.push(`- ${file.path}`);
	}
	return parts.join('\n');
};
