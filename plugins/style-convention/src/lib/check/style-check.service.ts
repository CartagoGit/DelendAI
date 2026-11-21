/**
 * style-check.service.ts — what is wrong with a stylesheet as it would be
 * saved, by the project's own rules.
 *
 * It refuses three things, each with the reason named: defining a
 * selector another layer owns, forking a selector that already has a
 * definition elsewhere, and hard-coding a value an existing design token
 * already names. Classes another gate owns are not decided here: the
 * finding names that gate. A folder declared `legacy-global` gets no
 * finding at all.
 */
import type {
	IDesignToken,
	ISelectorGraph,
	IStyleFinding,
	IStyleProfile,
	IStyleSource,
} from '../contracts/interfaces/selector-graph.interface';
import { extractDefinedClasses } from '../parse/style-sources.service';
import {
	architectureFor,
	directiveSupported,
	layerOf,
	ownerOfSelector,
} from '../profile/style-profile.service';

/** A value worth naming: shorter ones (`0`, `1`) are not what tokens are for. */
const MIN_TOKEN_VALUE_LENGTH = 3;

const normalise = (value: string): string =>
	value.trim().toLowerCase().split(' ').filter(Boolean).join(' ');

/** A declaration line split at its first colon, without the trailing `;`. */
const declarationOf = (
	line: string,
): { readonly name: string; readonly value: string } | undefined => {
	const text = line.trim();
	const colon = text.indexOf(':');
	if (colon <= 0 || !text.endsWith(';')) return undefined;
	return {
		name: text.slice(0, colon).trim(),
		value: text.slice(colon + 1, -1).trim(),
	};
};

const isTokenName = (name: string): boolean =>
	name.startsWith('--') || name.startsWith('$');

/** The design tokens a stylesheet declares: CSS custom properties and SCSS variables. */
export const designTokensOf = (source: IStyleSource): readonly IDesignToken[] =>
	source.text.split('\n').flatMap((line) => {
		const declaration = declarationOf(line);
		return declaration !== undefined && isTokenName(declaration.name)
			? [{ ...declaration, file: source.path }]
			: [];
	});

const lineOfClass = (text: string, name: string): number => {
	const at = text.split('\n').findIndex((line) => line.includes(`.${name}`));
	return at === -1 ? 1 : at + 1;
};

export const checkStyle = (input: {
	readonly profile: IStyleProfile;
	readonly graph: ISelectorGraph;
	readonly tokens: readonly IDesignToken[];
	/** The stylesheet as it would be saved. */
	readonly edit: IStyleSource;
	/** The installed major of the utility framework, when there is one. */
	readonly utilityMajor?: number | undefined;
}): readonly IStyleFinding[] => {
	const { profile, graph, tokens, edit } = input;
	const architecture = architectureFor(profile, edit.path);
	if (architecture === 'legacy-global') return [];
	const findings: IStyleFinding[] = [];
	const layer = layerOf(profile, edit.path);
	for (const name of extractDefinedClasses(edit.text)) {
		const line = lineOfClass(edit.text, name);
		const shared = profile.sharedPrefixes.find((prefix) =>
			name.startsWith(prefix),
		);
		if (shared !== undefined) {
			const elsewhere = (
				graph.selectors.get(name)?.definedIn ?? []
			).filter((path) => path !== edit.path);
			if (elsewhere.length > 0) {
				findings.push({
					kind: 'shared-owned',
					line,
					message: `.${name} is a shared class (\`${shared}*\`), already defined in ${elsewhere.join(', ')}`,
					remedy: `It is not this check's to decide: ${profile.sharedAuthority} owns \`${shared}*\`. Change the shared definition, or run that gate.`,
				});
			}
			continue;
		}
		const owner = ownerOfSelector(profile, name);
		if (owner !== undefined && owner !== layer) {
			findings.push({
				kind: 'foreign-selector',
				line,
				message: `.${name} belongs to the ${owner} layer; ${edit.path} is in ${layer ?? 'no declared layer'}`,
				remedy: `Define it in the ${owner} layer, or use a selector this file's layer owns.`,
			});
			continue;
		}
		const elsewhere = (graph.selectors.get(name)?.definedIn ?? []).filter(
			(path) => path !== edit.path,
		);
		if (elsewhere.length > 0) {
			findings.push({
				kind: 'forked-selector',
				line,
				message: `.${name} is already defined in ${elsewhere.join(', ')}`,
				remedy: 'Change the existing definition, or name this one for what makes it different: two definitions of one selector are two styles for whoever uses it.',
			});
		}
	}
	const named = new Map(
		tokens
			.filter((token) => token.value.length >= MIN_TOKEN_VALUE_LENGTH)
			.map((token) => [normalise(token.value), token] as const),
	);
	for (const [index, text] of edit.text.split('\n').entries()) {
		const directive = /^\s*@([a-z-]+)/u.exec(text)?.[1];
		if (
			architecture === 'tailwind' &&
			directive !== undefined &&
			directiveSupported(directive, input.utilityMajor) === false
		) {
			findings.push({
				kind: 'unsupported-directive',
				line: index + 1,
				message: `@${directive} is not accepted by the installed major (${String(input.utilityMajor)}) of the utility framework`,
				remedy: 'Use what that version provides, or upgrade the dependency first: a directive it does not know is dropped or fails the build.',
			});
		}
		const declaration = declarationOf(text);
		if (declaration === undefined || isTokenName(declaration.name))
			continue;
		const token = named.get(normalise(declaration.value));
		if (token !== undefined) {
			findings.push({
				kind: 'literal-has-token',
				line: index + 1,
				message: `${declaration.name}: ${declaration.value} hard-codes a value the design token ${token.name} (${token.file}) already names`,
				remedy: `Use ${token.name.startsWith('--') ? `var(${token.name})` : token.name}: a second copy of the value stops following the token.`,
			});
		}
	}
	return findings;
};
