import type { ITestConvention } from './convention';

export interface ISuggestResult {
	readonly specPath: string;
	readonly rationale: string;
	readonly skeleton: string;
}

const basenameOf = (path: string): string => {
	const parts = path.split('/');
	return parts.at(-1) ?? path;
};

const stripTsExt = (name: string): string => name.replace(/\.tsx?$/u, '');

/**
 * Pure path calculator: given a source file inside the workspace,
 * return where its companion spec should live, per the convention,
 * plus a minimal skeleton the agent can paste as the spec body.
 */
export const suggestSpecPath = (
	sourcePath: string,
	convention: ITestConvention,
): ISuggestResult => {
	const ext = convention.specExtension;
	const base = stripTsExt(basenameOf(sourcePath));
	const skeleton = [
		`describe(${JSON.stringify(base)}, () => {`,
		`  it('does the thing', () => {`,
		`    // arrange / act / assert`,
		`  });`,
		`});`,
	].join('\n');

	if (!sourcePath.startsWith('src/')) {
		return {
			specPath: sourcePath.replace(/\.tsx?$/u, `.${ext}`),
			rationale: 'non-src path: place spec next to source (colocate)',
			skeleton,
		};
	}

	switch (convention.specLayout) {
		case 'colocate':
			return {
				specPath: sourcePath.replace(/\.tsx?$/u, `.${ext}`),
				rationale: `colocate: <source>.${ext}`,
				skeleton,
			};
		case 'tests-mirror':
			return {
				specPath: sourcePath
					.replace(/^src\//u, 'tests/')
					.replace(/\.tsx?$/u, `.${ext}`),
				rationale: `mirror under tests/: tests/<mirror-of-src>.${ext}`,
				skeleton,
			};
		case 'tests-flat':
			return {
				specPath: `tests/${base}.${ext}`,
				rationale: `flat: tests/<basename>.${ext}`,
				skeleton,
			};
	}
};
