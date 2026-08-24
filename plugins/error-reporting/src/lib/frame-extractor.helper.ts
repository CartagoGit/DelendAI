import type { ISafeMcpFrame } from './contracts/interfaces/safe-frame.interface';

const NODE_MODULES_SCOPE =
	/(?:^|[\\/])node_modules[\\/]@mcp-vertex[\\/]([^\\/]+)[\\/](.+)$/;
const PACKAGE_SCOPE = /(?:^|[\\/])packages[\\/]([^\\/]+)[\\/](.+)$/;
const PLUGIN_SCOPE = /(?:^|[\\/])plugins[\\/]([^\\/]+)[\\/](.+)$/;
const ALREADY_SAFE_SCOPE = /@mcp-vertex\/([^/]+)\/(.+)$/;
const FRAME_LINE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

const toPosix = (value: string): string => value.replaceAll('\\', '/');

const packageFileOf = (rawPath: string): string | undefined => {
	const normalized = toPosix(rawPath);
	const scoped = ALREADY_SAFE_SCOPE.exec(normalized);
	if (scoped?.[1] !== undefined && scoped[2] !== undefined) {
		return `@mcp-vertex/${scoped[1]}/${scoped[2]}`;
	}
	const fromNodeModules = NODE_MODULES_SCOPE.exec(rawPath);
	if (
		fromNodeModules?.[1] !== undefined &&
		fromNodeModules[2] !== undefined
	) {
		return `@mcp-vertex/${fromNodeModules[1]}/${toPosix(fromNodeModules[2])}`;
	}
	const fromPackages = PACKAGE_SCOPE.exec(rawPath);
	if (fromPackages?.[1] !== undefined && fromPackages[2] !== undefined) {
		return `@mcp-vertex/${fromPackages[1]}/${toPosix(fromPackages[2])}`;
	}
	const fromPlugins = PLUGIN_SCOPE.exec(rawPath);
	if (fromPlugins?.[1] !== undefined && fromPlugins[2] !== undefined) {
		return `@mcp-vertex/${fromPlugins[1]}/${toPosix(fromPlugins[2])}`;
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
	const match = /^@mcp-vertex\/[^/]+/.exec(frame.file);
	return match?.[0];
};

export const extractSafeMcpFrames = (
	error: unknown,
): readonly ISafeMcpFrame[] => {
	const stack = stackOf(error);
	if (stack === undefined || stack.trim() === '') return [];
	const seen = new Set<string>();
	const frames: ISafeMcpFrame[] = [];
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
		const key = `${safeFile}:${match[3]}:${match[4]}:${match[1] ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		frames.push({
			file: safeFile,
			line: Number(match[3]),
			col: Number(match[4]),
			...(match[1] !== undefined ? { fn: match[1].trim() } : {}),
		});
	}
	return frames;
};
