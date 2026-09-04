/**
 * generate-tool-types.ts — N23 generated tool-output SDK.
 *
 * Assembles the canonical reference server (every shipped plugin),
 * harvests each tool's Zod `outputSchema`, converts it to JSON Schema
 * via `z.toJSONSchema` (Zod v4, zero extra deps) and writes one
 * `src/generated/tool-outputs.ts` per package using the pure emitter in
 * `emit-tool-types.script.ts`.
 *
 *     bun run types:generate          # write the files
 *
 * The pure routing/emitting lives in `emit-tool-types.script.ts`; the only
 * impure parts here are assembling the server and writing files. The
 * harvester is exported so the drift-guard test can compare the
 * checked-in files against a fresh in-memory generation.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import z from 'zod';

import {
	assembleCliConfig,
	createMcpProject,
	parseCliArgs,
} from '@delendai/core/public';

import proposalsPlugin from '@delendai/proposals';
import rulesPlugin from '@delendai/rules';
import memoryPlugin from '@delendai/memory';
import gitPlugin from '@delendai/git';
import qualityPlugin from '@delendai/quality';
import searchPlugin from '@delendai/search';
import notificationPlugin from '@delendai/notification';
import docsPlugin from '@delendai/docs';
import depsPlugin from '@delendai/deps';
import logsPlugin from '@delendai/logs';
import auditPlugin from '@delendai/audit';
import statusMarkerPlugin from '@delendai/status-marker';
import testConventionPlugin from '@delendai/test-convention';
import webFetchPlugin from '@delendai/web-fetch';
import cachePlugin from '@delendai/cache';
import containerPlugin from '@delendai/container';
import securityPlugin from '@delendai/security';
import diagramPlugin from '@delendai/diagram';
import envPlugin from '@delendai/env';
import i18nPlugin from '@delendai/i18n';
import perfPlugin from '@delendai/perf';
import techDebtPlugin from '@delendai/tech-debt';
import linkCheckPlugin from '@delendai/link-check';
import usageTrackingPlugin from '../../../plugins/usage-tracking/src/index';
import browserPlugin from '@delendai/browser';
import refactorPlugin from '@delendai/refactor';
import promptEvalPlugin from '@delendai/prompt-eval';
import observabilityPlugin from '@delendai/observability';
import completionPlugin from '@delendai/completion';
import contextForChangePlugin from '@delendai/context-for-change';
import impactAnalysisPlugin from '@delendai/impact-analysis';
import adaptiveOptimizerPlugin from '@delendai/adaptive-optimizer';
import projectHealthPlugin from '@delendai/project-health';
import qualityPolicyPlugin from '@delendai/quality-policy';

import {
	buildPackageModules,
	type IHarvestedTool,
} from './emit-tool-types.script';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const PLUGIN_SPECIFIERS: Readonly<Record<string, unknown>> = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
	'mcp-logs': logsPlugin,
	'mcp-audit': auditPlugin,
	'mcp-status-marker': statusMarkerPlugin,
	'mcp-test-convention': testConventionPlugin,
	'mcp-web-fetch': webFetchPlugin,
	'mcp-cache': cachePlugin,
	'mcp-container': containerPlugin,
	'mcp-security': securityPlugin,
	'mcp-diagram': diagramPlugin,
	'mcp-env': envPlugin,
	'mcp-i18n': i18nPlugin,
	'mcp-perf': perfPlugin,
	'mcp-tech-debt': techDebtPlugin,
	'mcp-link-check': linkCheckPlugin,
	'mcp-usage-tracking': usageTrackingPlugin,
	'mcp-browser': browserPlugin,
	'mcp-refactor': refactorPlugin,
	'mcp-prompt-eval': promptEvalPlugin,
	'mcp-observability': observabilityPlugin,
	'mcp-completion': completionPlugin,
	'mcp-context-for-change': contextForChangePlugin,
	'mcp-impact-analysis': impactAnalysisPlugin,
	'mcp-adaptive-optimizer': adaptiveOptimizerPlugin,
	'mcp-project-health': projectHealthPlugin,
	'mcp-quality-policy': qualityPolicyPlugin,
};

const PLUGIN_SPECIFIER_ENTRIES = Object.entries(PLUGIN_SPECIFIERS).sort(
	(left, right) => right[0].length - left[0].length,
);

const PLUGIN_LIST =
	'proposals,rules,memory,git,quality,search,notification,completion,context-for-change,docs,deps,logs,audit,status-marker,test-convention,web-fetch,cache,container,security,diagram,env,i18n,impact-analysis,adaptive-optimizer,project-health,quality-policy,perf,tech-debt,link-check,usage-tracking,browser,refactor,prompt-eval,observability,agent-orchestrator';
/**
 * Assemble the reference server with every plugin and harvest each
 * tool's output JSON Schema. Closes the server before returning so no
 * background watcher keeps the process (or the test runner) alive.
 */
export const harvestToolSchemas = async (): Promise<IHarvestedTool[]> => {
	const harvestWorkspace = mkdtempSync(join(tmpdir(), 'delendai-types-'));
	const args = parseCliArgs(
		[
			`--plugins=${PLUGIN_LIST}`,
			`--workspace=${harvestWorkspace}`,
			'--surface=native',
		],
		REPO_ROOT,
	);
	const { config } = await assembleCliConfig(args, {
		import: async (specifier: string) => {
			const hit = PLUGIN_SPECIFIER_ENTRIES.find(([key]) =>
				specifier.includes(key),
			);
			return { default: hit ? hit[1] : undefined };
		},
		// Synthetic config, harvest-only: turns on the opt-in surfaces so
		// their `outputSchema`s get harvested too — `deps`'s `allowNetwork`
		// (deps_outdated / deps_audit) and `git`'s `allowForge` (pr_list /
		// pr_view). Every other plugin still sees no config file (default
		// options), matching the real CLI default.
		readFile: async (absolutePath: string) =>
			absolutePath.endsWith('delendai.config.json')
				? JSON.stringify({
						plugins: {
							deps: { options: { allowNetwork: true } },
							git: { options: { allowForge: true } },
						},
					})
				: undefined,
	});
	const assembled = await createMcpProject(config);
	try {
		const registered = (
			assembled.server as unknown as {
				_registeredTools: Record<string, { outputSchema?: z.ZodType }>;
			}
		)._registeredTools;
		const tools: IHarvestedTool[] = [];
		for (const [name, def] of Object.entries(registered)) {
			if (def.outputSchema === undefined) continue;
			const schema = z.toJSONSchema(def.outputSchema, {
				unrepresentable: 'any',
			}) as IHarvestedTool['schema'];
			tools.push({ name, schema });
		}
		tools.sort((a, b) => a.name.localeCompare(b.name));
		return tools;
	} finally {
		await assembled.server.close();
		rmSync(harvestWorkspace, { recursive: true, force: true });
	}
};

/** Generate the file map (path relative to repo root → content). */
export const generateToolOutputModules = async (): Promise<
	Map<string, string>
> => buildPackageModules(await harvestToolSchemas());

const main = async (): Promise<void> => {
	const modules = await generateToolOutputModules();
	for (const [relPath, content] of modules) {
		const abs = join(REPO_ROOT, relPath);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, content, 'utf8');
		console.log(`  wrote ${relPath}`);
	}
	console.log(`types:generate — ${modules.size} package module(s) written.`);
	// Plugins start background watchers (e.g. notification); exit explicitly.
	process.exit(0);
};

if (import.meta.main) {
	void main();
}
