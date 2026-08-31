#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

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

interface IGroup {
	readonly label: string;
	readonly names: readonly string[];
}

const countExportStatements = (filePath: string): number =>
	readFileSync(filePath, 'utf8')
		.split(/\r?\n/u)
		.filter((line) => line.trim().startsWith('export')).length;

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

const uniqueSorted = (values: Iterable<string>): string[] =>
	[...new Set(values)].sort((left, right) => left.localeCompare(right));

const root = repoRoot();
const publicFile = resolve(root, 'packages/core/src/public/index.ts');
const contractsFile = resolve(root, 'packages/core/src/contracts/index.ts');
const pluginFile = resolve(root, 'packages/core/src/plugin/index.ts');
const runtimeFile = resolve(root, 'packages/core/src/runtime/index.ts');

const totalExportStatements = countExportStatements(publicFile);
const publicExports = parseExports(publicFile);
const publicImports = parseImports(publicFile);
const publicByName = new Map(
	publicExports.map((entry) => [entry.exported, entry]),
);
const contractExports = parseExports(contractsFile);
const pluginExports = parseExports(pluginFile);
const runtimeExports = parseExports(runtimeFile);

const contractsGroup = uniqueSorted(
	contractExports
		.filter((entry) => publicByName.get(entry.exported)?.typeOnly === true)
		.map((entry) => entry.exported),
);

const pluginGroup = uniqueSorted(
	pluginExports
		.filter(
			(entry) =>
				!entry.typeOnly &&
				entry.exported !== 'nodeDynamicImport' &&
				publicByName.get(entry.exported)?.source === '../plugin',
		)
		.map((entry) => entry.exported),
);

const runtimeSharedDirectGroup = uniqueSorted(
	runtimeExports
		.filter(
			(entry) =>
				!entry.typeOnly &&
				publicByName
					.get(entry.exported)
					?.source?.startsWith('../lib/') === true,
		)
		.map((entry) => entry.exported),
);

const nodeShimImport = publicImports.find(
	(entry) => entry.local === 'nodeDynamicImportImpl',
);

const groups: IGroup[] = [
	{ label: 'contracts', names: contractsGroup },
	{ label: 'plugin', names: pluginGroup },
	{ label: 'runtime-kept-in-public', names: runtimeSharedDirectGroup },
	{
		label: 'node-shim',
		names:
			nodeShimImport?.source === '../node' &&
			publicByName.has('nodeDynamicImport')
				? ['nodeDynamicImport']
				: [],
	},
	{
		label: 'direct-public',
		names: uniqueSorted(
			publicExports
				.filter(
					(entry) =>
						entry.source !== '../contracts' &&
						entry.source !== '../plugin',
				)
				.map((entry) => entry.exported),
		),
	},
];

if (process.argv.includes('--json')) {
	console.log(
		JSON.stringify(
			{
				totalExportStatements,
				totalNamedExports: publicExports.length,
				groups,
			},
			null,
			2,
		),
	);
	process.exit(0);
}

const lines = [
	'core public surface report',
	`public barrel: packages/core/src/public/index.ts`,
	`total export statements: ${totalExportStatements}`,
	`total named exports: ${publicExports.length}`,
	'',
];

for (const group of groups) {
	lines.push(`${group.label}: ${group.names.length}`);
	for (const name of group.names) {
		lines.push(`  - ${name}`);
	}
	lines.push('');
}

console.log(lines.join('\n'));
