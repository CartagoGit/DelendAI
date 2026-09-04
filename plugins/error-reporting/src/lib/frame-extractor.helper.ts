import { fileURLToPath } from 'node:url';

import type { ISafeMcpFrame } from './contracts/interfaces/safe-frame.interface';

const NODE_MODULES_SCOPE =
	/(?:^|[\\/])node_modules[\\/]@delendai[\\/]([^\\/]+)[\\/](.+)$/;
const ALREADY_SAFE_SCOPE = /@delendai\/([^/]+)\/(.+)$/;
const FRAME_LINE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

const internalPathRegistry = new Map<
	string,
	{
		readonly kind: 'mcp-scope' | 'monorepo-root' | 'package-root';
		readonly prefix: string;
		readonly packageId?: string | undefined;
	}
>();

const toPosix = (value: string): string => value.replaceAll('\\', '/');

const normalizePrefix = (value: string): string =>
	toPosix(value).replace(/\/+$/, '');

const registerKeyOf = (
	kind: 'mcp-scope' | 'monorepo-root' | 'package-root',
	prefix: string,
	packageId?: string,
): string => `${kind}:${prefix}:${packageId ?? ''}`;

const registeredEntries = () =>
	[...internalPathRegistry.values()].sort(
		(left, right) => right.prefix.length - left.prefix.length,
	);

const packageFileFromMonorepoRoot = (
	normalizedPath: string,
	prefix: string,
): string | undefined => {
	if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) {
		return undefined;
	}
	const relative = normalizedPath.slice(prefix.length + 1);
	const match = /^(?:packages|plugins)\/([^/]+)\/(.+)$/.exec(relative);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return `@delendai/${match[1]}/${match[2]}`;
};

const packageFileFromScope = (
	normalizedPath: string,
	prefix: string,
): string | undefined => {
	if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) {
		return undefined;
	}
	const relative = normalizedPath.slice(prefix.length + 1);
	const match = /^([^/]+)\/(.+)$/.exec(relative);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return `@delendai/${match[1]}/${match[2]}`;
};

const packageFileFromPackageRoot = (
	normalizedPath: string,
	prefix: string,
	packageId: string,
): string | undefined => {
	if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) {
		return undefined;
	}
	if (normalizedPath === prefix) return undefined;
	return `${packageId}/${normalizedPath.slice(prefix.length + 1)}`;
};

const packageFileOf = (
	rawPath: string,
):
	| {
			readonly file: string;
			readonly source: 'mcp-package' | 'registered-internal-path';
	  }
	| undefined => {
	const normalized = toPosix(rawPath);
	const scoped = ALREADY_SAFE_SCOPE.exec(normalized);
	if (scoped?.[1] !== undefined && scoped[2] !== undefined) {
		return {
			file: `@delendai/${scoped[1]}/${scoped[2]}`,
			source: 'mcp-package',
		};
	}
	const fromNodeModules = NODE_MODULES_SCOPE.exec(rawPath);
	if (
		fromNodeModules?.[1] !== undefined &&
		fromNodeModules[2] !== undefined
	) {
		return {
			file: `@delendai/${fromNodeModules[1]}/${toPosix(fromNodeModules[2])}`,
			source: 'mcp-package',
		};
	}
	for (const entry of registeredEntries()) {
		const safeFile =
			entry.kind === 'mcp-scope'
				? packageFileFromScope(normalized, entry.prefix)
				: entry.kind === 'monorepo-root'
					? packageFileFromMonorepoRoot(normalized, entry.prefix)
					: entry.packageId !== undefined
						? packageFileFromPackageRoot(
								normalized,
								entry.prefix,
								entry.packageId,
							)
						: undefined;
		if (safeFile !== undefined) {
			return {
				file: safeFile,
				source: 'registered-internal-path',
			};
		}
	}
	return undefined;
};

const stackOf = (error: unknown): string | undefined => {
	if (error instanceof Error) return error.stack;
	if (typeof error === 'object' && error !== null) {
		const record = error as { stack?: unknown };
		if (typeof record.stack === 'string') return record.stack;
	}
	return undefined;
};

export const packageIdFromSafeFrame = (
	frame: ISafeMcpFrame,
): string | undefined => {
	const match = /^@delendai\/[^/]+/.exec(frame.file);
	return match?.[0];
};

export const registerInternalPath = (
	absPath: string,
	packageId?: string,
): void => {
	const prefix = normalizePrefix(absPath);
	if (prefix === '') return;
	const kind =
		packageId !== undefined
			? 'package-root'
			: prefix.endsWith('/node_modules/@delendai')
				? 'mcp-scope'
				: 'monorepo-root';
	internalPathRegistry.set(registerKeyOf(kind, prefix, packageId), {
		kind,
		prefix,
		...(packageId !== undefined ? { packageId } : {}),
	});
};

export const resetInternalPathRegistry = (): void => {
	internalPathRegistry.clear();
};

export const registerInternalRuntimePaths = (moduleUrl: string): void => {
	const normalized = toPosix(fileURLToPath(moduleUrl));
	const nodeModulesMatch =
		/^(.*\/node_modules\/@delendai)(?:\/[^/]+\/.+)$/.exec(normalized);
	if (nodeModulesMatch?.[1] !== undefined) {
		registerInternalPath(nodeModulesMatch[1]);
	}
	const monorepoMatch = /^(.*)\/(?:packages|plugins)\/[^/]+\/.+$/.exec(
		normalized,
	);
	if (monorepoMatch?.[1] !== undefined) {
		registerInternalPath(monorepoMatch[1]);
	}
};

export const extractSafeMcpFrameEvidence = (
	error: unknown,
): readonly {
	readonly frame: ISafeMcpFrame;
	readonly source: 'mcp-package' | 'registered-internal-path';
}[] => {
	const stack = stackOf(error);
	if (stack === undefined || stack.trim() === '') return [];
	const seen = new Set<string>();
	const frames: {
		readonly frame: ISafeMcpFrame;
		readonly source: 'mcp-package' | 'registered-internal-path';
	}[] = [];
	for (const line of stack.split('\n')) {
		const match = FRAME_LINE.exec(line);
		if (
			match?.[2] === undefined ||
			match[3] === undefined ||
			match[4] === undefined
		) {
			continue;
		}
		const safeFile = packageFileOf(match[2]);
		if (safeFile === undefined) continue;
		const key = `${safeFile.file}:${match[3]}:${match[4]}:${match[1] ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		frames.push({
			frame: {
				file: safeFile.file,
				line: Number(match[3]),
				col: Number(match[4]),
				...(match[1] !== undefined ? { fn: match[1].trim() } : {}),
			},
			source: safeFile.source,
		});
	}
	return frames;
};

export const extractSafeMcpFrames = (
	error: unknown,
): readonly ISafeMcpFrame[] =>
	extractSafeMcpFrameEvidence(error).map((entry) => entry.frame);
