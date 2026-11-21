import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import proposalsPlugin from '@delendai/proposals';
import qualityPlugin from '@delendai/quality';

export const workspaces: string[] = [];

// Direct by name, not through the router. This harness pins `native`
// and does not opt into progressive disclosure, so every proposals tool
// is listed and callable — that is precisely what `native` promises. The
// router is the one tool `native` HIDES, so routing through it here fails
// with `-32602 ... disabled`.
export const syncProposals = (client: Client) =>
	client.callTool({
		name: 'delendai_proposals_sync_proposals',
		arguments: {},
	});

export interface IGateOverrides {
	/** Replaces the workspace's `validate` script (a shell command). */
	readonly validate?: string;
	readonly closeGateWaitMs?: number;
	/** A `development` block for delendai.config.json. */
	readonly development?: object;
}

export const createQualityServer = async (
	command: string,
	overrides: IGateOverrides = {},
) => {
	const workspace = mkdtempSync(join(tmpdir(), 'proposals-quality-e2e-'));
	workspaces.push(workspace);
	const config = JSON.stringify({
		...(overrides.development !== undefined
			? { development: overrides.development }
			: {}),
		plugins: {
			quality: { options: { scopes: { all: [command] } } },
			proposals: {
				options: {
					requirePeerReview: false,
					...(overrides.closeGateWaitMs !== undefined
						? { closeGateWaitMs: overrides.closeGateWaitMs }
						: {}),
				},
			},
		},
	});
	writeFileSync(join(workspace, 'delendai.config.json'), config, 'utf8');
	mkdirSync(join(workspace, 'tools/scripts/quality'), { recursive: true });
	writeFileSync(
		join(workspace, 'tools/scripts/quality/run-quality.script.ts'),
		`const ok = ${command === 'true'};\nconsole.log(JSON.stringify({ok, severity: ok ? 'ok' : 'error', findings: ok ? [] : ['close: command failed'], summary: {ok, scopes: 1}}));\nprocess.exit(ok ? 0 : 1);\n`,
		'utf8',
	);
	// `close_slice`'s gate runs the project's own `validate` script and
	// judges it by exit code; it does NOT read
	// `plugins.quality.options.scopes`, which governs the `quality_run_all`
	// TOOL asserted separately below. The gate certifies a git tree, so the
	// workspace is one.
	execFileSync('git', ['init', '-q'], { cwd: workspace });
	writeFileSync(
		join(workspace, 'package.json'),
		JSON.stringify(
			{
				name: 'proposals-quality-e2e',
				private: true,
				scripts: {
					validate:
						overrides.validate ??
						'bun tools/scripts/quality/run-quality.script.ts',
				},
			},
			null,
			2,
		),
		'utf8',
	);
	const args = parseCliArgs(
		[
			'--plugins=proposals,quality',
			`--workspace=${workspace}`,
			'--surface=native',
		],
		workspace,
	);
	const { config: hostConfig } = await assembleCliConfig(args, {
		import: async (specifier) => ({
			default: specifier.includes('quality')
				? qualityPlugin
				: proposalsPlugin,
		}),
	});
	const project = await createMcpProject(hostConfig);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await project.server.connect(serverTransport);
	const client = new Client(
		{ name: 'quality-close-slice-e2e', version: '0.0.0' },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);
	return { workspace, client, project };
};

export const seedSlice = (workspace: string, id: string): string => {
	const proposalDir = join(workspace, 'docs/delendai/proposals/ready');
	mkdirSync(proposalDir, { recursive: true });
	const proposalPath = join(proposalDir, `${id}-quality.md`);
	writeFileSync(
		proposalPath,
		`---\nid: ${id}\nstatus: ready\ntype: proposal\ntrack: plugins/proposals+tests\ndate: 2026-08-31\nkind: feat\ntitle: quality gate\n---\n\n# ${id} — quality gate\n\n## goal\n\nExercise the quality gate.\n\n## Slices\n\n- global_gate: none\n\n### S1 — quality gate\n- **Status**: pending\n- **Files**: \`src/quality.ts\`\n- **Gate**: none\n`,
		'utf8',
	);
	return proposalPath;
};

export const findProposalPath = (workspace: string, id: string): string => {
	const proposalsDir = join(workspace, 'docs/delendai/proposals');
	const entries = readdirSync(proposalsDir, { recursive: true }).filter(
		(entry): entry is string => typeof entry === 'string',
	);
	const relativePath = entries.find(
		(entry) =>
			entry.endsWith('.md') &&
			readFileSync(join(proposalsDir, entry), 'utf8').includes(
				`id: ${id}`,
			),
	);
	if (relativePath !== undefined) return join(proposalsDir, relativePath);
	throw new Error(`proposal ${id} was not found under ${proposalsDir}`);
};
