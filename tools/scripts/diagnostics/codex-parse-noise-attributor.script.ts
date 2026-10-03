#!/usr/bin/env bun
//
// codex-parse-noise-attributor.script.ts
//
// Decodes the cryptic 'Failed to parse message' warnings that the OpenAI
// Codex VSCode extension emits into its per-instance Codex.log. The
// bundle inside the openai.chatgpt extension is minified and ships
// only the literal string, so the warning is useless on its own. The
// user only sees the symptom and has no way to know that the source
// is the Codex IPC / WebSocket router (not delendai, not Copilot).
//
// This script walks every Codex.log under the running VSCode instance
// (default HOME/.vscode-server/data/logs, overridable via --root=path),
// finds every line that matches the literal warning, and prints a
// one-line attribution per cluster: which extension emitted it, which
// log file, which channel, and the most recent preceding log line so
// the user can see what the server was doing when the bad frame
// arrived.
//
// With --rewrite, the script copies the log to <log>.attributed and
// replaces every offending line with a multi-line English explanation
// that names the source and gives the user the uninstall command.
//
// Exit codes:
//   0 — no noise detected (or rewrite finished cleanly)
//   1 — noise detected (dry-run only)
//   2 — IO error
//
// Usage:
//   bun tools/scripts/diagnostics/codex-parse-noise-attributor.script.ts
//   bun tools/scripts/diagnostics/codex-parse-noise-attributor.script.ts --rewrite
//   bun tools/scripts/diagnostics/codex-parse-noise-attributor.script.ts --root=/custom/path

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const homeDir = (): string => homedir();

const NOISE_RX = /Failed to parse message/;
const TIMESTAMP_RX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(\w+)\]/;
const CHANNEL_HINT_RX =
	/\[(IpcRouter|IpcClient|CodexMcpConnection|CodexMcpServer|CodexNative|StreamHandler)\]/;

interface IFlag {
	readonly rewrite: boolean;
	readonly root: string;
}

export const parseFlags = (argv: readonly string[]): IFlag => {
	let rewrite = false;
	let root = join(homeDir(), '.vscode-server', 'data', 'logs');
	for (const arg of argv) {
		if (arg === '--rewrite') rewrite = true;
		else if (arg.startsWith('--root=')) {
			root = arg.slice('--root='.length);
		}
	}
	return { rewrite, root };
};

const discoverLogs = async (rootDir: string): Promise<readonly string[]> => {
	if (!existsSync(rootDir)) return [];
	const out: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			if (entry.name === 'Codex.log' && abs.includes('openai.chatgpt')) {
				out.push(abs);
			}
		}
	};
	await walk(rootDir);
	return out;
};

interface IAttributedNoise {
	readonly logPath: string;
	readonly timestamp: string;
	readonly level: string;
	readonly channel: string;
	readonly precedingLine: string;
	readonly rawWarningLine: string;
}

export const attributeLog = async (
	logPath: string,
): Promise<readonly IAttributedNoise[]> => {
	const raw = await readFile(logPath, 'utf8');
	const lines = raw.split('\n');
	const noise: IAttributedNoise[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		if (!NOISE_RX.test(line)) continue;
		const tsMatch = TIMESTAMP_RX.exec(line);
		const ts = tsMatch?.[1] ?? '<unknown>';
		const level = tsMatch?.[2] ?? '<unknown>';
		// Walk backwards to find the most recent preceding line that
		// actually carries a channel tag — that is the line the
		// warning's stack was anchored to in the bundle.
		let channel = '<unknown>';
		let preceding = '';
		for (let j = i - 1; j >= Math.max(0, i - 30); j -= 1) {
			const prev = lines[j] ?? '';
			const ch = CHANNEL_HINT_RX.exec(prev);
			if (ch?.[1] !== undefined) {
				channel = ch[1];
				preceding = prev;
				break;
			}
		}
		noise.push({
			logPath,
			timestamp: ts,
			level,
			channel,
			precedingLine: preceding,
			rawWarningLine: line,
		});
	}
	return noise;
};

const EXPLANATION_LINES: readonly string[] = [
	'[ATTRIBUTED] The literal string "Failed to parse message: newline" comes from the',
	'[ATTRIBUTED] OpenAI Codex VSCode extension',
	'[ATTRIBUTED] (publisher openai, id openai.chatgpt, version 26.x).',
	'[ATTRIBUTED] Its minified bundle ships only the literal, so the warning is',
	'[ATTRIBUTED] intentionally opaque. The Codex bundle parses JSON-RPC frames',
	'[ATTRIBUTED] arriving on either the IPC router (extension-host to native),',
	'[ATTRIBUTED] the CodexMcpConnection (MCP stdio to native codex binary), or a',
	'[ATTRIBUTED] generic StreamHandler. An empty JSON-RPC frame (a single newline)',
	'[ATTRIBUTED] is silently dropped and the parser logs this warning instead of',
	'[ATTRIBUTED] failing hard.',
	'[ATTRIBUTED]',
	'[ATTRIBUTED] This is NOT emitted by delendai or by GitHub Copilot Chat.',
	'[ATTRIBUTED] To silence it permanently:',
	'[ATTRIBUTED]   1. Uninstall the extension:  code --uninstall-extension openai.chatgpt',
	'[ATTRIBUTED]   2. Or disable it workspace-only via the VSCode command palette',
	'[ATTRIBUTED]      Extensions: Disable Workspace Extension -> Codex.',
	'[ATTRIBUTED] Original warning follows:',
];
const EXPLANATION = EXPLANATION_LINES.join('\n');

const rewriteLog = async (
	logPath: string,
	noise: readonly IAttributedNoise[],
): Promise<void> => {
	const raw = await readFile(logPath, 'utf8');
	const lines = raw.split('\n');
	const offendingIdx = new Set<number>();
	for (const n of noise) {
		const idx = lines.indexOf(n.rawWarningLine);
		if (idx >= 0) offendingIdx.add(idx);
	}
	const replacement: string[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (!offendingIdx.has(i)) {
			replacement.push(lines[i] ?? '');
			continue;
		}
		const n = noise.find((x) => x.rawWarningLine === (lines[i] ?? ''));
		if (n === undefined) {
			replacement.push(lines[i] ?? '');
			continue;
		}
		const banner = [
			`${n.timestamp} [info] [codex-parse-noise-attributor] attributed: channel=${n.channel} log=${logPath}`,
			EXPLANATION,
			n.rawWarningLine,
		];
		replacement.push(...banner);
	}
	const out = replacement.join('\n');
	const outPath = `${logPath}.attributed`;
	await writeFile(outPath, out, 'utf8');
};

const main = async (): Promise<void> => {
	const flags = parseFlags(process.argv.slice(2));
	const logs = await discoverLogs(flags.root);
	if (logs.length === 0) {
		console.log(
			`[codex-parse-noise-attributor] no Codex.log found under ${flags.root}. (pass --root=<path> to override).`,
		);
		return;
	}
	let totalNoise = 0;
	const channelCounts = new Map<string, number>();
	for (const log of logs) {
		const noise = await attributeLog(log);
		if (noise.length === 0) continue;
		console.log(`\n  ${log}`);
		console.log(`  ${noise.length} noise line(s):`);
		for (const n of noise) {
			const ctx =
				n.precedingLine.length > 0
					? n.precedingLine.slice(0, 100)
					: '(no preceding channel line in the last 30 lines)';
			console.log(
				`    ${n.timestamp} [${n.level}] channel=${n.channel} ctx="${ctx}…"`,
			);
			channelCounts.set(
				n.channel,
				(channelCounts.get(n.channel) ?? 0) + 1,
			);
		}
		totalNoise += noise.length;
		if (flags.rewrite) {
			await rewriteLog(log, noise);
			console.log(`    -> wrote ${log}.attributed`);
		}
	}
	console.log('\n[codex-parse-noise-attributor] summary:');
	console.log(`  logs scanned:   ${logs.length}`);
	console.log(`  noise lines:    ${totalNoise}`);
	if (channelCounts.size > 0) {
		console.log('  by channel:');
		for (const [channel, count] of [...channelCounts.entries()].sort(
			([, a], [, b]) => b - a,
		)) {
			console.log(`    ${channel.padEnd(20)} ${count}`);
		}
	}
	console.log('  attribution:    openai.chatgpt (Codex) — NOT delendai');
	if (totalNoise > 0 && !flags.rewrite) process.exit(1);
};

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error('[codex-parse-noise-attributor] fatal:', err);
		process.exit(2);
	});
}
