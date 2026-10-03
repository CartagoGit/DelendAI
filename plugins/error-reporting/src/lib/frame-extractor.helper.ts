import { fileURLToPath } from 'node:url';

import type { ISafeMcpFrame } from './contracts/interfaces/safe-frame.interface';

const ALREADY_SAFE_SCOPE = /@delendai\/([^/]+)\/(.+)$/;

/** The path segment a delendai package sits behind once installed. */
const NODE_MODULES_SCOPE_SEGMENT = 'node_modules/@delendai/';

const internalPathRegistry = new Map<
	string,
	{
		readonly kind: 'mcp-scope' | 'monorepo-root' | 'package-root';
		readonly prefix: string;
		readonly packageId?: string | undefined;
	}
>();

const toPosix = (value: string): string => value.replaceAll('\\', '/');

/**
 * `…/node_modules/@delendai/<pkg>/<file>` → `@delendai/<pkg>/<file>`.
 *
 * Scanned rather than matched. The pattern this replaced anchored its
 * prefix with `(?:^|[\\/])` and then asked for `(.+)$`, so the engine
 * retried the whole tail from every separator in the path — polynomial
 * in the length of a path that arrives inside a stack trace
 * (`js/polynomial-redos`). `indexOf` finds the one segment that matters.
 */
const scopedPathAfterNodeModules = (posixPath: string): string | undefined => {
	const at = posixPath.lastIndexOf(NODE_MODULES_SCOPE_SEGMENT);
	if (at === -1) return undefined;
	if (at !== 0 && posixPath[at - 1] !== '/') return undefined;
	const rest = posixPath.slice(at + NODE_MODULES_SCOPE_SEGMENT.length);
	const slash = rest.indexOf('/');
	if (slash <= 0 || slash === rest.length - 1) return undefined;
	return `@delendai/${rest}`;
};

/**
 * One `at …` line of a V8 stack, split by hand.
 *
 * The pattern this replaced put two lazy `.+?` next to a `\s+` and a
 * `:` that they could both match, which is quadratic in the length of a
 * frame line. The shape is simple enough to read directly: an optional
 * `fn (` prefix, then `file:line:col`.
 */
interface IParsedFrameLine {
	readonly fn: string | undefined;
	readonly file: string;
	readonly line: string;
	readonly col: string;
}

const parseFrameLine = (raw: string): IParsedFrameLine | undefined => {
	const line = raw.trim();
	if (!line.startsWith('at ')) return undefined;
	let rest = line.slice(3).trim();
	let fn: string | undefined;
	if (rest.endsWith(')')) {
		const open = rest.lastIndexOf(' (');
		if (open > 0) {
			fn = rest.slice(0, open);
			rest = rest.slice(open + 2, rest.length - 1);
		}
	}
	const lastColon = rest.lastIndexOf(':');
	if (lastColon <= 0) return undefined;
	const col = rest.slice(lastColon + 1);
	const beforeCol = rest.slice(0, lastColon);
	const secondColon = beforeCol.lastIndexOf(':');
	if (secondColon <= 0) return undefined;
	const lineNumber = beforeCol.slice(secondColon + 1);
	const file = beforeCol.slice(0, secondColon);
	if (!isDigits(col) || !isDigits(lineNumber) || file.length === 0) {
		return undefined;
	}
	return { fn, file, line: lineNumber, col };
};

const isDigits = (value: string): boolean => {
	if (value.length === 0) return false;
	for (const char of value) {
		if (char < '0' || char > '9') return false;
	}
	return true;
};

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
	const fromNodeModules = scopedPathAfterNodeModules(normalized);
	if (fromNodeModules !== undefined) {
		return { file: fromNodeModules, source: 'mcp-package' };
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
		const parsed = parseFrameLine(line);
		if (parsed === undefined) continue;
		const safeFile = packageFileOf(parsed.file);
		if (safeFile === undefined) continue;
		const key = `${safeFile.file}:${parsed.line}:${parsed.col}:${parsed.fn ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		frames.push({
			frame: {
				file: safeFile.file,
				line: Number(parsed.line),
				col: Number(parsed.col),
				...(parsed.fn !== undefined ? { fn: parsed.fn.trim() } : {}),
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
