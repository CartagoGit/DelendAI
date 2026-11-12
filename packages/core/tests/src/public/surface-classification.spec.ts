import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface IParsedExport {
	readonly exported: string;
	readonly source: string | null;
	readonly typeOnly: boolean;
}

interface IParsedImport {
	readonly local: string;
	readonly imported: string;
	readonly source: string;
}

const REPO_ROOT = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'../../../../..',
);

const PUBLIC_BARREL = resolve(REPO_ROOT, 'packages/core/src/public/index.ts');
const CONTRACTS_BARREL = resolve(
	REPO_ROOT,
	'packages/core/src/contracts/index.ts',
);
const PLUGIN_BARREL = resolve(REPO_ROOT, 'packages/core/src/plugin/index.ts');
const RUNTIME_BARREL = resolve(REPO_ROOT, 'packages/core/src/runtime/index.ts');

const parseExports = (filePath: string): IParsedExport[] => {
	const text = readFileSync(filePath, 'utf8');
	const lines = text.split(/\r?\n/u);
	const exports: IParsedExport[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index]?.trim() ?? '';
		if (!trimmed.startsWith('export')) continue;
		const valueMatch = trimmed.match(/^export\s+const\s+([A-Za-z0-9_]+)/u);
		if (valueMatch !== null) {
			const exported = valueMatch[1];
			if (exported === undefined) continue;
			exports.push({
				exported,
				source: null,
				typeOnly: false,
			});
			continue;
		}
		if (!/^export\s+(type\s+)?\{/u.test(trimmed)) continue;

		let block = trimmed;
		while (!block.includes(' from ') && index + 1 < lines.length) {
			block += ` ${lines[index + 1]?.trim() ?? ''}`;
			index += 1;
		}

		const sourceMatch = block.match(/from\s+'([^']+)'/u);
		const namesMatch = block.match(/\{([^}]*)\}/u);
		if (sourceMatch !== null && namesMatch !== null) {
			const source = sourceMatch[1];
			const namesBody = namesMatch[1];
			if (source === undefined || namesBody === undefined) continue;
			const exportTypeOnly = /^export\s+type\b/u.test(block);
			for (const rawPart of namesBody.split(',')) {
				let part = rawPart
					.replace(/\/\*.*?\*\//gu, '')
					.replace(/\/\/.*$/gu, '')
					.trim();
				if (part.length === 0) continue;
				const typeOnly = exportTypeOnly || part.startsWith('type ');
				part = part.replace(/^type\s+/u, '');
				const [left = '', right] = part.split(/\s+as\s+/iu);
				const exported = (right ?? left).trim();
				if (exported.length === 0) continue;
				exports.push({
					exported,
					source,
					typeOnly,
				});
			}
		}
	}

	return exports;
};

const parseImports = (filePath: string): IParsedImport[] => {
	const text = readFileSync(filePath, 'utf8');
	const lines = text.split(/\r?\n/u);
	const imports: IParsedImport[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index]?.trim() ?? '';
		if (!trimmed.startsWith('import')) continue;

		let block = trimmed;
		while (!block.includes(' from ') && index + 1 < lines.length) {
			block += ` ${lines[index + 1]?.trim() ?? ''}`;
			index += 1;
		}

		const sourceMatch = block.match(/from\s+'([^']+)'/u);
		const namesMatch = block.match(/\{([^}]*)\}/u);
		if (sourceMatch === null || namesMatch === null) continue;
		const source = sourceMatch[1];
		const namesBody = namesMatch[1];
		if (source === undefined || namesBody === undefined) continue;

		for (const rawPart of namesBody.split(',')) {
			const part = rawPart.replace(/\/\/.*$/gu, '').trim();
			if (part.length === 0) continue;
			const [left = '', right] = part.split(/\s+as\s+/iu);
			const imported = left.trim();
			const local = (right ?? left).trim();
			if (imported.length === 0 || local.length === 0) continue;
			imports.push({
				imported,
				local,
				source,
			});
		}
	}

	return imports;
};

const namesFrom = (
	entries: readonly IParsedExport[],
	predicate: (entry: IParsedExport) => boolean,
): string[] =>
	[
		...new Set(entries.filter(predicate).map((entry) => entry.exported)),
	].sort();

describe('public surface classification (r00040 S1)', () => {
	const publicExports = parseExports(PUBLIC_BARREL);
	const publicByName = new Map(
		publicExports.map((entry) => [entry.exported, entry]),
	);
	const publicImports = parseImports(PUBLIC_BARREL);
	const contractExports = parseExports(CONTRACTS_BARREL);
	const pluginExports = parseExports(PLUGIN_BARREL);
	const runtimeExports = parseExports(RUNTIME_BARREL);

	it('routes every shared contract type through the contracts subpath', () => {
		const sharedContractTypes = namesFrom(contractExports, (entry) => {
			const publicEntry = publicByName.get(entry.exported);
			return publicEntry?.typeOnly === true;
		});
		const publicContracts = namesFrom(
			publicExports,
			(entry) => entry.source === '../contracts',
		);
		expect(publicContracts).toEqual(sharedContractTypes);
	});

	it('routes the shared plugin toolkit values through the plugin subpath', () => {
		const pluginValueExports = namesFrom(
			pluginExports,
			(entry) =>
				!entry.typeOnly &&
				entry.exported !== 'nodeDynamicImport' &&
				publicByName.has(entry.exported),
		);
		const publicPluginValues = namesFrom(
			publicExports,
			(entry) => entry.source === '../plugin',
		);
		expect(publicPluginValues).toEqual(pluginValueExports);
	});

	it('keeps the runtime helper overlap directly in the public barrel', () => {
		const runtimeValueOverlap = namesFrom(runtimeExports, (entry) => {
			if (entry.typeOnly) return false;
			const publicEntry = publicByName.get(entry.exported);
			return publicEntry !== undefined;
		});
		const directRuntimeOverlap = runtimeValueOverlap.filter((name) => {
			const entry = publicByName.get(name);
			return entry?.source?.startsWith('../lib/') === true;
		});
		expect(directRuntimeOverlap).toEqual(runtimeValueOverlap);
		expect(
			publicExports.some((entry) => entry.source === '../runtime'),
		).toBe(false);
	});

	it('keeps the deprecated node shim owned by the node subpath', () => {
		const nodeImport = publicImports.find(
			(entry) => entry.local === 'nodeDynamicImportImpl',
		);
		const nodeExport = publicByName.get('nodeDynamicImport');
		expect(nodeImport).toEqual({
			imported: 'nodeDynamicImport',
			local: 'nodeDynamicImportImpl',
			source: '../node',
		});
		expect(nodeExport).toEqual({
			exported: 'nodeDynamicImport',
			source: null,
			typeOnly: false,
		});
	});
});
