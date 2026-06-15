import type { IFileReader } from '@cartago-git/mcp-core/public';
import { joinRel } from '@cartago-git/mcp-core/public';

export interface IDetectResult {
	readonly presetId: string;
	readonly reason: string;
}


const readDeps = (
	reader: IFileReader,
	areaDir: string
): Record<string, string> => {
	const raw = reader.readFile(joinRel(areaDir, 'package.json'));
	if (raw === undefined) return {};
	try {
		const pkg = JSON.parse(raw) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
	} catch {
		return {};
	}
};

const hasTypeScript = (
	reader: IFileReader,
	areaDir: string,
	deps: Record<string, string>
): boolean =>
	reader.exists(joinRel(areaDir, 'tsconfig.json')) ||
	reader.exists(joinRel(areaDir, 'tsconfig.app.json')) ||
	'typescript' in deps;

/**
 * Resolve which preset applies to one area, by its deps + TS presence.
 * Framework wins over language; falls back to vanilla-ts/js. Pure over
 * the injected reader so it is fully testable.
 */
export const detectPresetForArea = (
	reader: IFileReader,
	areaDir: string
): IDetectResult => {
	const deps = readDeps(reader, areaDir);
	const ts = hasTypeScript(reader, areaDir, deps);
	if ('@angular/core' in deps) {
		return { presetId: 'angular', reason: 'dependency @angular/core' };
	}
	if ('react' in deps) {
		return {
			presetId: ts ? 'react-ts' : 'react-js',
			reason: `dependency react (${ts ? 'ts' : 'js'})`,
		};
	}
	if ('vue' in deps) return { presetId: 'vue', reason: 'dependency vue' };
	if ('svelte' in deps) {
		return { presetId: 'svelte', reason: 'dependency svelte' };
	}
	if ('jquery' in deps) {
		return { presetId: 'jquery', reason: 'dependency jquery' };
	}
	return {
		presetId: ts ? 'vanilla-ts' : 'vanilla-js',
		reason: ts ? 'tsconfig/typescript present' : 'no framework or TS detected',
	};
};
