import { dirname, join, normalize, relative, resolve } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type { IQualityPolicyEntry } from '../contracts/interfaces/quality-policy.interface';

interface ITsFlags {
	readonly strict?: boolean;
	readonly exactOptionalPropertyTypes?: boolean;
	readonly noUncheckedIndexedAccess?: boolean;
	readonly noImplicitOverride?: boolean;
	readonly tsconfigChain: readonly string[];
}

const readJsonObject = async (
	reader: SafeWorkspaceReader,
	relativePath: string,
): Promise<Record<string, unknown> | undefined> => {
	const raw = await reader
		.readText(relativePath)
		.then((result) => result.content)
		.catch(() => undefined);
	if (raw === undefined) return undefined;
	try {
		const parsed = JSON.parse(raw) as unknown;
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

const resolveTsConfigFlags = async (
	reader: SafeWorkspaceReader,
	workspaceRootAbs: string,
	relativePath = 'tsconfig.json',
	seen = new Set<string>(),
): Promise<ITsFlags> => {
	const normalizedRel = normalize(relativePath).replaceAll('\\', '/');
	if (seen.has(normalizedRel)) {
		return { tsconfigChain: [] };
	}
	seen.add(normalizedRel);
	const absolutePath = join(workspaceRootAbs, normalizedRel);
	const current = await readJsonObject(reader, normalizedRel);
	if (current === undefined) {
		return { tsconfigChain: [] };
	}
	const compilerOptions =
		typeof current.compilerOptions === 'object' &&
		current.compilerOptions !== null
			? (current.compilerOptions as Record<string, unknown>)
			: {};
	const parentRef =
		typeof current.extends === 'string' ? current.extends : undefined;
	const parent =
		parentRef === undefined
			? { tsconfigChain: [] as readonly string[] }
			: await resolveTsConfigFlags(
					reader,
					workspaceRootAbs,
					relative(
						dirname(normalizedRel),
						resolve(dirname(absolutePath), parentRef),
					).replaceAll('\\', '/'),
					seen,
				);
	const inheritedChain = [...parent.tsconfigChain, normalizedRel];
	return {
		...(typeof compilerOptions.strict === 'boolean'
			? { strict: compilerOptions.strict }
			: parent.strict === undefined
				? {}
				: { strict: parent.strict }),
		...(typeof compilerOptions.exactOptionalPropertyTypes === 'boolean'
			? {
					exactOptionalPropertyTypes:
						compilerOptions.exactOptionalPropertyTypes,
				}
			: parent.exactOptionalPropertyTypes === undefined
				? {}
				: {
						exactOptionalPropertyTypes:
							parent.exactOptionalPropertyTypes,
					}),
		...(typeof compilerOptions.noUncheckedIndexedAccess === 'boolean'
			? {
					noUncheckedIndexedAccess:
						compilerOptions.noUncheckedIndexedAccess,
				}
			: parent.noUncheckedIndexedAccess === undefined
				? {}
				: {
						noUncheckedIndexedAccess:
							parent.noUncheckedIndexedAccess,
					}),
		...(typeof compilerOptions.noImplicitOverride === 'boolean'
			? { noImplicitOverride: compilerOptions.noImplicitOverride }
			: parent.noImplicitOverride === undefined
				? {}
				: { noImplicitOverride: parent.noImplicitOverride }),
		tsconfigChain: inheritedChain,
	};
};

export const buildTypesEntry = async (
	workspaceRootAbs: string,
): Promise<IQualityPolicyEntry> => {
	const flags = await resolveTsConfigFlags(
		new SafeWorkspaceReader(workspaceRootAbs),
		workspaceRootAbs,
	);
	const strictLabel =
		flags.strict === true
			? 'strict'
			: flags.strict === false
				? 'not strict'
				: 'unknown strictness';
	return {
		summary:
			flags.tsconfigChain.length > 0
				? `Type policy is ${strictLabel}; exactOptionalPropertyTypes=${String(flags.exactOptionalPropertyTypes === true)} from ${flags.tsconfigChain.join(' -> ')}.`
				: 'Type policy fell back to a static summary because no tsconfig chain could be read.',
		...(flags.strict === undefined ? {} : { strict: flags.strict }),
		...(flags.exactOptionalPropertyTypes === undefined
			? {}
			: {
					exactOptionalPropertyTypes:
						flags.exactOptionalPropertyTypes,
				}),
		...(flags.noUncheckedIndexedAccess === undefined
			? {}
			: {
					noUncheckedIndexedAccess: flags.noUncheckedIndexedAccess,
				}),
		...(flags.noImplicitOverride === undefined
			? {}
			: { noImplicitOverride: flags.noImplicitOverride }),
		tsconfigChain: flags.tsconfigChain,
		static: flags.tsconfigChain.length === 0,
	};
};
