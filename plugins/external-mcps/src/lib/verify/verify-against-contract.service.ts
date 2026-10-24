/**
 * verify-against-contract.service.ts — what was produced from an external
 * answer, checked against the project, not against the source.
 *
 * The same contract that went into the call is what the result must
 * hold to: a place the conventions know, design tokens instead of
 * literal values, and the framework version installed. When the source
 * wanted otherwise, the project wins and the finding names what it
 * overrode.
 */
import type {
	IContractFinding,
	IExternalSourceFacts,
	IProducedFile,
} from '../contracts/interfaces/external-answer.interface';
import type { IProjectContract } from '../contracts/interfaces/project-contract.interface';

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\([^)]*\)/giu;
const STYLED = /\.(?:css|scss|sass|less|vue|svelte|astro|tsx|jsx|html)$/u;

const majorOf = (version: string | undefined): string | undefined =>
	version?.match(/\d+/u)?.[0];

export const verifyAgainstContract = (input: {
	readonly files: readonly IProducedFile[];
	readonly contract: IProjectContract;
	/** The conventions role of a path, or `undefined` when no rule places it. */
	readonly roleOf?: (path: string) => string | undefined;
	readonly source?: IExternalSourceFacts;
}): readonly IContractFinding[] => {
	const findings: IContractFinding[] = [];
	const { contract } = input;
	if (contract.placement !== undefined && input.roleOf !== undefined)
		for (const file of input.files)
			if (input.roleOf(file.path) === undefined)
				findings.push({
					kind: 'placement',
					path: file.path,
					detail: `no rule of the ${contract.placement.profile} conventions places this file; move it where its role belongs`,
					resolvedTo: 'project',
				});
	if (contract.style !== undefined && contract.style.tokens.length > 0) {
		const byValue = new Map(
			contract.style.tokens.map((token) => [
				token.value.toLowerCase(),
				token.name,
			]),
		);
		for (const file of input.files.filter((produced) =>
			STYLED.test(produced.path),
		))
			for (const literal of new Set(
				file.content.match(COLOUR_LITERAL) ?? [],
			)) {
				const token = byValue.get(literal.toLowerCase());
				findings.push({
					kind: 'design-token',
					path: file.path,
					detail:
						token === undefined
							? `literal ${literal}: the project names its colours as design tokens; use one, or add it to the token files`
							: `literal ${literal} is the design token ${token}; use the token`,
					resolvedTo: 'project',
					overridden: literal,
				});
			}
	}
	const wanted = input.source?.framework;
	const installed = contract.framework;
	if (
		wanted !== undefined &&
		installed !== undefined &&
		wanted.id === installed.id &&
		majorOf(wanted.version) !== undefined &&
		majorOf(wanted.version) !== majorOf(installed.version)
	)
		findings.push({
			kind: 'framework-version',
			detail: `the source targets ${wanted.id} ${wanted.version}; the project has ${installed.version ?? 'an unknown version'} installed, and the code must be legal there`,
			resolvedTo: 'project',
			overridden: `${wanted.id} ${wanted.version}`,
		});
	return findings;
};
