import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IDetectedStack,
	SastLanguage,
} from '../contracts/interfaces/sast.interface';

const IGNORE_DIRS = new Set([
	'.git',
	'.cache',
	'node_modules',
	'dist',
	'build',
	'coverage',
]);

const FILE_LANGUAGE: Readonly<Record<string, SastLanguage>> = {
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.py': 'python',
	'.go': 'go',
	'.rs': 'rust',
	'.json': 'generic',
	'.yaml': 'generic',
	'.yml': 'generic',
};

const languageFromPath = (path: string): SastLanguage | undefined => {
	const dot = path.lastIndexOf('.');
	if (dot < 0) return undefined;
	return FILE_LANGUAGE[path.slice(dot)] as SastLanguage | undefined;
};

const readManifestDeps = async (cwd: string): Promise<readonly string[]> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(cwd).readText('package.json')
		).content;
		const json = JSON.parse(raw) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return [
			...Object.keys(json.dependencies ?? {}),
			...Object.keys(json.devDependencies ?? {}),
		];
	} catch {
		return [];
	}
};

const walkFiles = async (
	cwd: string,
	dir = cwd,
	accumulator: string[] = [],
	budget = { count: 0 },
): Promise<string[]> => {
	if (budget.count >= 4000) return accumulator;
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (budget.count >= 4000) break;
		if (IGNORE_DIRS.has(entry.name)) continue;
		const absolute = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkFiles(cwd, absolute, accumulator, budget);
			continue;
		}
		budget.count += 1;
		const relative = absolute.slice(cwd.length + 1);
		if (languageFromPath(relative) !== undefined)
			accumulator.push(relative);
	}
	return accumulator;
};

const hasFile = async (cwd: string, name: string): Promise<boolean> => {
	try {
		return (await stat(join(cwd, name))).isFile();
	} catch {
		return false;
	}
};

export const detectStack = async (cwd: string): Promise<IDetectedStack> => {
	const [deps, files, pyproject, requirements, goMod, cargoToml] =
		await Promise.all([
			readManifestDeps(cwd),
			walkFiles(cwd),
			hasFile(cwd, 'pyproject.toml'),
			hasFile(cwd, 'requirements.txt'),
			hasFile(cwd, 'go.mod'),
			hasFile(cwd, 'Cargo.toml'),
		]);
	const found = new Set<SastLanguage>();
	for (const file of files) {
		const language = languageFromPath(file);
		if (language !== undefined && language !== 'generic')
			found.add(language);
	}
	if (
		deps.some((dep) =>
			['typescript', 'astro', 'vite', 'next', 'react'].includes(dep),
		)
	) {
		found.add('typescript');
	}
	if (deps.some((dep) => ['eslint', 'webpack'].includes(dep))) {
		found.add('javascript');
	}
	if (pyproject || requirements) found.add('python');
	if (goMod) found.add('go');
	if (cargoToml) found.add('rust');
	const languages = [...found].sort();
	if (languages.length === 0) {
		return { pack: 'generic', languages: ['generic'], files };
	}
	if (languages.length === 1) {
		const language = languages[0];
		if (language === undefined) {
			return { pack: 'generic', languages: ['generic'], files };
		}
		return {
			pack: language,
			languages:
				language === 'typescript'
					? ['typescript', 'javascript', 'generic']
					: language === 'javascript'
						? ['javascript', 'generic']
						: [language, 'generic'],
			files,
		};
	}
	return {
		pack: 'mixed',
		languages: [...languages, 'generic'],
		files,
	};
};
