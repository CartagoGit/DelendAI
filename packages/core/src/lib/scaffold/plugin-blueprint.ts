/**
 * f00120 S1 — pure plugin blueprint renderer.
 *
 * Given a first-party plugin id, a one-line description, and one sample tool
 * id, render the complete plugin package shape expected by this monorepo.
 * Every renderer is deterministic and side-effect free: same deps => same
 * bytes.
 */

export interface BlueprintFile {
	readonly path: string;
	readonly content: string;
}

export interface IPluginBlueprintDeps {
	readonly name: string;
	readonly description: string;
	readonly sampleToolId: string;
}

export const PROJECT_LICENSE_TEXT = [
	'BSD 3-Clause License',
	'',
	'Copyright (c) 2026, Cartago',
	'All rights reserved.',
	'',
	'Redistribution and use in source and binary forms, with or without',
	'modification, are permitted provided that the following conditions are met:',
	'',
	'1. Redistributions of source code must retain the above copyright notice,',
	'   this list of conditions and the following disclaimer.',
	'',
	'2. Redistributions in binary form must reproduce the above copyright notice,',
	'   this list of conditions and the following disclaimer in the documentation',
	'   and/or other materials provided with the distribution.',
	'',
	'3. Neither the name of the copyright holder nor the names of its',
	'   contributors may be used to endorse or promote products derived from',
	'   this software without specific prior written permission.',
	'',
	'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"',
	'AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE',
	'IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE',
	'ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE',
	'LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR',
	'CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF',
	'SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS',
	'INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN',
	'CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)',
	'ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE',
	'POSSIBILITY OF SUCH DAMAGE.',
].join('\n');

const BLUEPRINT_VERSION = '0.1.0';
const REPOSITORY_URL = 'https://github.com/CartagoGit/mcp-vertex';

const withTrailingNewline = (content: string): string => `${content}\n`;

const blueprintPath = (
	deps: IPluginBlueprintDeps,
	relativePath: string,
): string => `${pluginDir(deps.name)}/${relativePath}`;

const sanitizeSentence = (value: string): string =>
	value.replace(/\s+/gu, ' ').trim();

const splitIdentifier = (value: string): readonly string[] =>
	value
		.split(/[^a-zA-Z0-9]+/gu)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

const kebab = (value: string): string =>
	splitIdentifier(value).join('-').toLowerCase();

const snake = (value: string): string =>
	splitIdentifier(value)
		.map((part) => part.toLowerCase())
		.join('_');

const pascal = (value: string): string =>
	splitIdentifier(value)
		.map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join('');

const toolSuffix = (deps: IPluginBlueprintDeps): string => {
	const prefix = `${deps.name}.`;
	if (deps.sampleToolId.startsWith(prefix)) {
		return deps.sampleToolId.slice(prefix.length);
	}
	const segments = deps.sampleToolId
		.split('.')
		.filter((segment) => segment.length > 0);
	return segments.at(-1) ?? deps.sampleToolId;
};

const toolFileSlug = (deps: IPluginBlueprintDeps): string =>
	kebab(deps.sampleToolId);

const toolRegistrationId = (deps: IPluginBlueprintDeps): string =>
	snake(toolSuffix(deps));

const toolRegistrationName = (deps: IPluginBlueprintDeps): string =>
	`${deps.name}_${toolRegistrationId(deps)}`;

const toolSymbolBase = (deps: IPluginBlueprintDeps): string =>
	pascal(toolFileSlug(deps));

const sampleToolPath = (deps: IPluginBlueprintDeps): string =>
	blueprintPath(deps, `src/lib/tools/${toolFileSlug(deps)}.tool.ts`);

const sampleToolSpecPath = (deps: IPluginBlueprintDeps): string =>
	blueprintPath(
		deps,
		`tests/src/lib/tools/${toolFileSlug(deps)}.tool.spec.ts`,
	);

const renderJson = (value: unknown): string =>
	withTrailingNewline(JSON.stringify(value, null, '\t'));

/** Plugin dir under the monorepo. Pure repo-relative path, no cwd/env lookup. */
export const pluginDir = (name: string): string => `plugins/${name}`;

export const renderTsconfig = (deps: IPluginBlueprintDeps): BlueprintFile => ({
	path: blueprintPath(deps, 'tsconfig.json'),
	content: renderJson({
		extends: '../../tsconfig.base.json',
		compilerOptions: {
			tsBuildInfoFile: `./node_modules/.cache/${deps.name}.tsbuildinfo`,
		},
		include: ['src/**/*', 'tests/**/*'],
	}),
});

export const renderPackageJson = (
	deps: IPluginBlueprintDeps,
): BlueprintFile => ({
	path: blueprintPath(deps, 'package.json'),
	content: renderJson({
		name: `@mcp-vertex/${deps.name}`,
		version: BLUEPRINT_VERSION,
		type: 'module',
		description: sanitizeSentence(deps.description),
		author: 'Cartago',
		license: 'BSD-3-Clause',
		keywords: [
			'mcp',
			'model-context-protocol',
			deps.name,
			'plugin',
			'agent',
			'ai',
			'cartago',
		],
		main: './dist/index.js',
		files: ['dist', 'README.md', 'LICENSE'],
		exports: {
			'.': {
				'@mcp-vertex/source': {
					types: './src/index.ts',
				},
				types: './dist/index.d.ts',
				import: './dist/index.js',
			},
			'./public': {
				'@mcp-vertex/source': {
					types: './src/public/index.ts',
				},
				types: './dist/public/index.d.ts',
				import: './dist/public/index.js',
			},
			'./lib/*': {
				'@mcp-vertex/source': {
					types: './src/lib/*',
				},
				types: './dist/lib/*',
			},
		},
		scripts: {
			test: 'vitest run',
			'check:i18n': `bun -e "process.stdout.write('No plugin-local i18n catalog to validate for ${deps.name}.\\n')"`,
			typecheck: 'tsc --noEmit',
			build: `bun ../../tools/scripts/compile/build.script.ts ${pluginDir(deps.name)}`,
		},
		peerDependencies: {
			'@mcp-vertex/core': '^0.1.0',
		},
		dependencies: {
			'@modelcontextprotocol/sdk': '^1.29.0',
			zod: '^4.4.3',
		},
		devDependencies: {
			'@mcp-vertex/core': 'workspace:*',
			'@types/bun': 'latest',
			typescript: '7.0.2',
			vitest: '4.1.10',
		},
		publishConfig: {
			access: 'public',
		},
		repository: {
			type: 'git',
			url: REPOSITORY_URL,
		},
		module: './dist/index.js',
		types: './dist/index.d.ts',
	}),
});

export const renderVitestConfig = (
	deps: IPluginBlueprintDeps,
): BlueprintFile => ({
	path: blueprintPath(deps, 'vitest.config.ts'),
	content: withTrailingNewline(
		[
			"import { dirname, resolve } from 'node:path';",
			"import { fileURLToPath } from 'node:url';",
			"import { defineConfig } from 'vitest/config';",
			'',
			"import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';",
			'',
			'const here = dirname(fileURLToPath(import.meta.url));',
			"const workspaceRoot = resolve(here, '../..');",
			'',
			'export default defineConfig({',
			'\tresolve: { alias: workspaceAliases(workspaceRoot) },',
			'\ttest: {',
			`\t\tname: '${deps.name}',`,
			"\t\tinclude: ['tests/**/*.spec.ts'],",
			"\t\texclude: ['**/node_modules/**', '**/dist/**'],",
			"\t\tenvironment: 'node',",
			'\t\tglobals: false,',
			'\t\tsetupFiles: sharedSetupFiles(workspaceRoot),',
			'\t},',
			'});',
		].join('\n'),
	),
});

export const renderIndexTs = (deps: IPluginBlueprintDeps): BlueprintFile => {
	const toolBuilder = `build${toolSymbolBase(deps)}ToolRegistration`;
	return {
		path: blueprintPath(deps, 'src/index.ts'),
		content: withTrailingNewline(
			[
				"import { definePlugin } from '@mcp-vertex/core/public';",
				'',
				`import { ${toolBuilder} } from './lib/tools/${toolFileSlug(deps)}.tool';`,
				'',
				'/**',
				` * ${sanitizeSentence(deps.description)}`,
				' *',
				` * Load with \`mcp-vertex --plugins=${deps.name}\`. The emitted sample tool`,
				` * echoes \`${deps.sampleToolId}\` so authors can replace a working,`,
				' * schema-backed tool instead of filling an empty stub.',
				' */',
				'export default definePlugin({',
				`\tname: '${deps.name}',`,
				`\tversion: '${BLUEPRINT_VERSION}',`,
				`\tdescribe: '${sanitizeSentence(deps.description).replace(/'/gu, "\\'")}',`,
				'\tregister(ctx) {',
				'\t\treturn {',
				'\t\t\ttools: [',
				`\t\t\t\t${toolBuilder}({ namespacePrefix: ctx.namespacePrefix }),`,
				'\t\t\t],',
				'\t\t\tknowledge: [',
				'\t\t\t\t{',
				`\t\t\t\t\tid: '${deps.name}-overview',`,
				`\t\t\t\t\ttitle: '${deps.name} plugin',`,
				'\t\t\t\t\tbody: [',
				`\t\t\t\t\t\t'# ${deps.name}',`,
				"\t\t\t\t\t\t'',",
				`\t\t\t\t\t\t'${sanitizeSentence(deps.description).replace(/'/gu, "\\'")}',`,
				"\t\t\t\t\t\t'',",
				`\t\t\t\t\t\t'- Sample tool: \`${deps.sampleToolId}\`.',`,
				"\t\t\t\t\t].join('\\n'),",
				'\t\t\t\t},',
				'\t\t\t],',
				'\t\t};',
				'\t},',
				'});',
			].join('\n'),
		),
	};
};

export const renderSampleToolTs = (
	deps: IPluginBlueprintDeps,
): BlueprintFile => {
	const symbolBase = toolSymbolBase(deps);
	const argsType = `I${symbolBase}Args`;
	const resultType = `I${symbolBase}Result`;
	const schemaName = `${symbolBase.toUpperCase()}_OUTPUT_SCHEMA`;
	return {
		path: sampleToolPath(deps),
		content: withTrailingNewline(
			[
				"import { z } from 'zod';",
				'',
				"import type { IToolRegistration } from '@mcp-vertex/core/public';",
				"import { toolJson } from '@mcp-vertex/core/public';",
				'',
				`export interface ${argsType} {`,
				'\treadonly message: string;',
				'}',
				'',
				`export interface ${resultType} {`,
				'\treadonly ok: true;',
				`\treadonly plugin: '${deps.name}';`,
				`\treadonly toolId: '${deps.sampleToolId}';`,
				'\treadonly echoedMessage: string;',
				'}',
				'',
				`export const ${symbolBase.toUpperCase()}_INPUT_SCHEMA = z`,
				'\t.object({',
				'\t\tmessage: z.string().min(1),',
				'\t})',
				'\t.strict();',
				'',
				`export const ${schemaName} = z.object({`,
				'\tok: z.literal(true),',
				`\tplugin: z.literal('${deps.name}'),`,
				`\ttoolId: z.literal('${deps.sampleToolId}'),`,
				'\techoedMessage: z.string(),',
				'});',
				'',
				`export const build${symbolBase}ToolRegistration = (options: {`,
				'\treadonly namespacePrefix: string;',
				'}): IToolRegistration => ({',
				`\tid: '${toolRegistrationId(deps)}',`,
				`\tsummary: 'Echo sample payloads for the ${deps.name} plugin blueprint.',`,
				"\ttags: ['sample', 'blueprint'],",
				'\tregister: async (server) => {',
				'\t\tserver.registerTool(',
				`\t\t\t\`${'${options.namespacePrefix}'}_${toolRegistrationId(deps)}\`,`,
				'\t\t\t{',
				`\t\t\t\tdescription: 'Echo a payload and stamp it with ${deps.sampleToolId} so the ${deps.name} plugin scaffold has a working sample tool.',`,
				`\t\t\t\tinputSchema: ${symbolBase.toUpperCase()}_INPUT_SCHEMA,`,
				`\t\t\t\toutputSchema: ${schemaName},`,
				'\t\t\t},',
				`\t\t\tasync (args: ${argsType}) =>`,
				'\t\t\t\ttoolJson({',
				'\t\t\t\t\tok: true,',
				`\t\t\t\t\tplugin: '${deps.name}',`,
				`\t\t\t\t\ttoolId: '${deps.sampleToolId}',`,
				`\t\t\t\t\techoedMessage: '${deps.sampleToolId}:' + args.message,`,
				'\t\t\t\t}),',
				'\t\t);',
				'\t},',
				'});',
			].join('\n'),
		),
	};
};

export const renderSampleToolSpec = (
	deps: IPluginBlueprintDeps,
): BlueprintFile => {
	const symbolBase = toolSymbolBase(deps);
	const toolBuilder = `build${symbolBase}ToolRegistration`;
	const argsType = `I${symbolBase}Args`;
	return {
		path: sampleToolSpecPath(deps),
		content: withTrailingNewline(
			[
				"import { describe, expect, it } from 'vitest';",
				'',
				`import { ${toolBuilder}, type ${argsType} } from '../../../../src/lib/tools/${toolFileSlug(deps)}.tool';`,
				'',
				`type Handler = (args: ${argsType}) => Promise<{ structuredContent?: Record<string, unknown> }>;`,
				'',
				`const capture = async (): Promise<Handler> => {`,
				'\tlet handler: Handler | undefined;',
				'\tconst server = {',
				'\t\tregisterTool(name: string, _config: unknown, fn: Handler): void {',
				`\t\t\tif (name === '${toolRegistrationName(deps)}') handler = fn;`,
				'\t\t},',
				'\t};',
				`\tconst registration = ${toolBuilder}({ namespacePrefix: '${deps.name}' });`,
				'\tawait registration.register(',
				'\t\tserver as unknown as Parameters<typeof registration.register>[0],',
				'\t);',
				`\tif (!handler) throw new Error('${deps.sampleToolId} did not register');`,
				'\treturn handler;',
				'};',
				'',
				`describe('${deps.sampleToolId}', () => {`,
				`\tit('echoes the payload for the ${deps.name} scaffold', async () => {`,
				'\t\tconst handler = await capture();',
				"\t\tconst result = await handler({ message: 'hello' });",
				'\t\tconst body = result.structuredContent as {',
				'\t\t\tok: boolean;',
				'\t\t\tplugin: string;',
				'\t\t\ttoolId: string;',
				'\t\t\techoedMessage: string;',
				'\t\t};',
				'\t\texpect(body.ok).toBe(true);',
				`\t\texpect(body.plugin).toBe('${deps.name}');`,
				`\t\texpect(body.toolId).toBe('${deps.sampleToolId}');`,
				`\t\texpect(body.echoedMessage).toBe('${deps.sampleToolId}:hello');`,
				'\t});',
				'});',
			].join('\n'),
		),
	};
};

export const renderPublicBarrel = (
	deps: IPluginBlueprintDeps,
): BlueprintFile => {
	const symbolBase = toolSymbolBase(deps);
	const toolBuilder = `build${symbolBase}ToolRegistration`;
	const argsType = `I${symbolBase}Args`;
	const resultType = `I${symbolBase}Result`;
	return {
		path: blueprintPath(deps, 'src/public/index.ts'),
		content: withTrailingNewline(
			[
				'/**',
				` * Public surface of \`@mcp-vertex/${deps.name}\`.`,
				` * Re-exports the loadable plugin plus the sample \`${deps.sampleToolId}\` contracts.`,
				' */',
				"export { default } from '../index';",
				'',
				`export { ${toolBuilder}, ${symbolBase.toUpperCase()}_INPUT_SCHEMA, ${symbolBase.toUpperCase()}_OUTPUT_SCHEMA } from '../lib/tools/${toolFileSlug(deps)}.tool';`,
				`export type { ${argsType}, ${resultType} } from '../lib/tools/${toolFileSlug(deps)}.tool';`,
			].join('\n'),
		),
	};
};

export const renderReadme = (deps: IPluginBlueprintDeps): BlueprintFile => ({
	path: blueprintPath(deps, 'README.md'),
	content: withTrailingNewline(
		[
			`# @mcp-vertex/${deps.name}`,
			'',
			sanitizeSentence(deps.description),
			'',
			'## Tool surface',
			'',
			'| Tool id | Registered name | Summary |',
			'| --- | --- | --- |',
			`| \`${deps.sampleToolId}\` | \`${toolRegistrationName(deps)}\` | Echo sample payloads for the ${deps.name} plugin blueprint. |`,
			'',
			'## Use',
			'',
			'Load the plugin in the monorepo host or wire it into a preset after scaffolding:',
			'',
			'```bash',
			`mcp-vertex --plugins=${deps.name}`,
			'```',
		].join('\n'),
	),
});

export const renderLicense = (): BlueprintFile => ({
	path: 'LICENSE',
	content: withTrailingNewline(PROJECT_LICENSE_TEXT),
});

export const renderPluginBlueprint = (
	deps: IPluginBlueprintDeps,
): readonly BlueprintFile[] => [
	renderPackageJson(deps),
	renderTsconfig(deps),
	renderVitestConfig(deps),
	renderReadme(deps),
	{
		path: blueprintPath(deps, renderLicense().path),
		content: renderLicense().content,
	},
	renderIndexTs(deps),
	renderSampleToolTs(deps),
	renderPublicBarrel(deps),
	renderSampleToolSpec(deps),
];
