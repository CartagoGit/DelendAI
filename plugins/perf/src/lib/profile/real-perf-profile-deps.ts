/**
 * real-perf-profile-deps.ts — production profiler probe + bounded runner for
 * the perf plugin. Probes PATH via the shared core helper and uses Node's
 * built-in CPU profiler to produce a normalized hotspot report. Scratch
 * directories are anchored under `<pluginCacheDir>/exec/<stamp>/` via
 * `resolveExecPath` + `withEphemeralExec` so the lint stays happy and the
 * cache is GC'd by the shared `pruneExpiredExec` helper.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	type IExternalTool,
	type IMcpPluginContext,
	probeTool,
	realProbeDeps,
	resolveExecPath,
	runExternalTool,
	withEphemeralExec,
} from '@delendai/core/public';
import type {
	IPerfProfileExecution,
	IPerfProfileDeps,
	IRealPerfProfileDepsOptions,
	PerfProfileFormat,
	IPerfProfileCaptureInput,
} from '../contracts/interfaces/perf.interface';

const NODE_PROF = {
	id: 'node-prof',
	bin: 'node',
	versionArgs: ['--version'],
	versionPattern: /v?(\d+\.\d+\.\d+)/u,
	installHints: [
		{
			manager: 'system',
			command: 'Install Node.js and ensure `node` is available on PATH.',
		},
	],
} satisfies IExternalTool;

const ZERO_X = {
	id: '0x',
	bin: '0x',
	versionArgs: ['--version'],
	installHints: [
		{
			manager: 'npm',
			command: 'npm install -g 0x',
		},
	],
} satisfies IExternalTool;

const CLINIC_FLAME = {
	id: 'clinic-flame',
	bin: 'clinic',
	versionArgs: ['--version'],
	installHints: [
		{
			manager: 'npm',
			command: 'npm install -g clinic',
		},
	],
} satisfies IExternalTool;

const inlineWorkload = (): string =>
	[
		"const fs=require('node:fs');",
		"const path=require('node:path');",
		'const root=process.argv[1];',
		'const stack=[root];',
		'let visited=0;',
		'let checksum=0;',
		'while(stack.length>0&&visited<250){',
		'  const current=stack.pop();',
		'  visited+=1;',
		'  let entries=[];',
		'  try { entries=fs.readdirSync(current,{withFileTypes:true}); } catch { continue; }',
		'  for (const entry of entries) {',
		'    const next=path.join(current,entry.name);',
		'    checksum+=entry.name.length;',
		'    if (entry.isDirectory()) stack.push(next);',
		'  }',
		'}',
		'for (let index=0; index<4000000; index+=1) checksum += index % 7;',
		'console.log(String(checksum));',
	].join('');

const execCtxFor = (pluginCacheDir: string): IMcpPluginContext =>
	({ pluginCacheDir }) as IMcpPluginContext;

/** Resolve an absolute, ephemeral directory under `<pluginCacheDir>/exec/perf-<stamp>/`. */
const ephemeralProfileDir = async (
	ctx: IMcpPluginContext,
	stamp: string,
): Promise<string> =>
	await withEphemeralExec(ctx, `perf-${stamp}/.keep`, async (abs) => {
		const dir = join(abs, '..');
		await mkdir(dir, { recursive: true });
		return dir;
	});

const runNodeProf = async (
	ctx: IMcpPluginContext,
	cwd: string,
	timeoutMs: number,
): Promise<IPerfProfileExecution> => {
	const stamp = randomUUID().slice(0, 8);
	const tempDir = await ephemeralProfileDir(ctx, stamp);
	try {
		const profile = await runExternalTool({
			tool: NODE_PROF,
			args: ['--prof', '-e', inlineWorkload(), cwd],
			cwd: tempDir,
			timeoutMs,
			maxOutputBytes: 32 * 1024,
		});
		if (!profile.ok) {
			const detail = `${profile.stderr}${profile.stdout}`.trim();
			return {
				ok: false,
				profiler: NODE_PROF.id,
				code: profile.code,
				timedOut: profile.timedOut,
				...(detail.length > 0 ? { detail } : {}),
			};
		}

		const logs = (await readdir(tempDir)).filter((entry) =>
			entry.startsWith('isolate-'),
		);
		const logFile = logs.find((entry) => entry.endsWith('.log'));
		if (logFile === undefined) {
			return {
				ok: false,
				profiler: NODE_PROF.id,
				code: 0,
				timedOut: false,
				detail: 'Node CPU profiler did not emit an isolate log.',
			};
		}

		const processed = await runExternalTool({
			tool: NODE_PROF,
			args: ['--prof-process', join(tempDir, logFile)],
			cwd: tempDir,
			timeoutMs,
			maxOutputBytes: 128 * 1024,
		});
		const detail = `${processed.stderr}${processed.stdout}`.trim();
		return {
			ok: processed.ok,
			profiler: NODE_PROF.id,
			report: `${processed.stdout}\n${processed.stderr}`.trim(),
			code: processed.code,
			timedOut: processed.timedOut,
			...(!processed.ok && detail.length > 0 ? { detail } : {}),
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true }).catch(
			() => undefined,
		);
	}
};

export const realPerfProfileDeps = (
	workspaceRootAbs: string,
	options: IRealPerfProfileDepsOptions = {},
): IPerfProfileDeps => {
	const probeDeps = options.probeDeps ?? realProbeDeps();
	const pluginCacheDir =
		options.pluginCacheDir ?? join(workspaceRootAbs, '.cache', 'delendai');
	const ctx = execCtxFor(pluginCacheDir);
	void resolveExecPath(ctx, '.keep', { skipMkdir: true }).catch(
		() => undefined,
	);
	return {
		probeProfilers: async (format: PerfProfileFormat) => {
			const ordered =
				format === 'flamegraph'
					? [ZERO_X, CLINIC_FLAME, NODE_PROF]
					: [NODE_PROF, ZERO_X, CLINIC_FLAME];
			return Promise.all(
				ordered.map((tool) => probeTool(tool, probeDeps)),
			);
		},
		runProfiler: async (
			_profilerId: string,
			input: IPerfProfileCaptureInput,
		) => runNodeProf(ctx, input.cwd, input.timeoutMs),
	};
};
