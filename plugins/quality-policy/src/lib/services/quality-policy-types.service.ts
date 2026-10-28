import { dirname, join, normalize, relative, resolve } from 'node:path';

import {
	SafeWorkspaceReader,
	workspacePackageDirs,
} from '@delendai/core/runtime';

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

/** A package tsconfig whose type policy is not the root's. */
const differsFromRoot = (root: ITsFlags, area: ITsFlags): boolean =>
	area.strict !== root.strict ||
	area.exactOptionalPropertyTypes !== root.exactOptionalPropertyTypes;

export const buildTypesEntry = async (
	workspaceRootAbs: string,
): Promise<IQualityPolicyEntry> => {
	const reader = new SafeWorkspaceReader(workspaceRootAbs);
	const flags = await resolveTsConfigFlags(reader, workspaceRootAbs);
	// Every workspace package's tsconfig is read, not only the root chain:
	// a package that relaxes strictness is a different policy for its code.
	const areas: {
		readonly path: string;
		readonly strict?: boolean;
		readonly exactOptionalPropertyTypes?: boolean;
	}[] = [];
	let read = flags.tsconfigChain.length > 0 ? 1 : 0;
	for (const dir of await workspacePackageDirs(workspaceRootAbs)) {
		const area = await resolveTsConfigFlags(
			reader,
			workspaceRootAbs,
			`${dir}/tsconfig.json`,
		);
		if (area.tsconfigChain.length === 0) continue;
		read += 1;
		if (!differsFromRoot(flags, area)) continue;
		areas.push({
			path: `${dir}/tsconfig.json`,
			...(area.strict === undefined ? {} : { strict: area.strict }),
			...(area.exactOptionalPropertyTypes === undefined
				? {}
				: {
						exactOptionalPropertyTypes:
							area.exactOptionalPropertyTypes,
					}),
		});
	}
	const strictLabel =
		flags.strict === true
			? 'strict'
			: flags.strict === false
				? 'not strict'
				: 'unknown strictness';
	const areaNote =
		read > 1
			? ` ${read} tsconfig(s) read; ${areas.length === 0 ? 'every package follows the root' : `${areas.length} package(s) differ: ${areas.map((area) => area.path).join(', ')}`}.`
			: '';
	return {
		summary:
			flags.tsconfigChain.length > 0
				? `Type policy is ${strictLabel}; exactOptionalPropertyTypes=${String(flags.exactOptionalPropertyTypes === true)} from ${flags.tsconfigChain.join(' -> ')}.${areaNote}`
				: `Type policy fell back to a static summary because no root tsconfig chain could be read.${areaNote}`,
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
		...(areas.length === 0 ? {} : { tsconfigAreas: areas }),
		static: flags.tsconfigChain.length === 0,
	};
};
