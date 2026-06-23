import { readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, basename, join, relative } from 'path';
import { $ } from 'bun';

const filesRaw = await $`find plugins/*/src/lib -type f -name "*.ts"`.text();
const testFilesRaw =
	await $`find plugins/*/tests/src/lib -type f -name "*.spec.ts"`.text();

const files = filesRaw.split('\n').filter(Boolean);
const testFiles = testFilesRaw.split('\n').filter(Boolean);

function guessRole(content: string, name: string): string {
	if (
		name.endsWith('.interface.ts') ||
		name.endsWith('.constant.ts') ||
		name.endsWith('.service.ts') ||
		name.endsWith('.tool.ts')
	) {
		return 'keep';
	}
	if (
		content.includes('export interface I') ||
		(content.includes('export type ') &&
			!content.includes('export class') &&
			!content.includes('export const '))
	) {
		return 'interface';
	}
	if (
		content.includes('export const ') &&
		!content.includes('export class') &&
		!content.includes('export function') &&
		!content.includes('export const searchWorkspace') &&
		!content.includes('export const register')
	) {
		return 'constant';
	}
	if (
		(content.includes('export const ') ||
			content.includes('export function ')) &&
		(content.includes('tool =') ||
			content.includes('_tool =') ||
			name.includes('tool'))
	) {
		return 'tool';
	}
	if (content.includes('export const') && content.includes('tool'))
		return 'tool';

	// Default to service
	return 'service';
}

function computeNewPath(filePath: string, role: string): string {
	const dir = dirname(filePath);
	const base = basename(filePath, '.ts');

	// find plugin root: plugins/search
	const parts = filePath.split('/');
	const pluginName = parts[1];
	const pluginRoot = `plugins/${pluginName}/src/lib`;

	let destDir = '';
	let suffix = '';

	switch (role) {
		case 'interface':
			destDir = join(pluginRoot, 'contracts/interfaces');
			suffix = '.interface.ts';
			break;
		case 'constant':
			destDir = join(pluginRoot, 'contracts/constants');
			suffix = '.constant.ts';
			break;
		case 'service':
			destDir = join(pluginRoot, 'services');
			suffix = '.service.ts';
			break;
		case 'tool':
			destDir = join(pluginRoot, 'tools');
			suffix = '.tool.ts';
			break;
		default:
			return filePath;
	}

	// remove .script, etc if present
	const cleanBase = base.replace(/\.(service|interface|constant|tool)$/, '');
	return join(destDir, cleanBase + suffix);
}

const renames = new Map<string, string>();

for (const f of files) {
	if (basename(f) === 'index.ts' || basename(f) === 'types.ts') continue;
	if (
		basename(dirname(f)) === 'proposals' ||
		basename(dirname(f)) === 'swarm'
	)
		continue; // too complex, leave for manual
	const content = readFileSync(f, 'utf8');
	const role = guessRole(content, basename(f));
	if (role !== 'keep') {
		const newPath = computeNewPath(f, role);
		if (newPath !== f) {
			renames.set(f, newPath);
		}
	}
}

console.log(JSON.stringify(Array.from(renames.entries()), null, 2));
