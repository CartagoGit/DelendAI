const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');
const vscode = require('vscode');

async function run() {
	const outputFile = process.env.MCP_VERTEX_BENCH_OUTPUT_FILE;
	const extensionId = process.env.MCP_VERTEX_BENCH_EXTENSION_ID;
	const scenario = process.env.MCP_VERTEX_BENCH_SCENARIO;
	if (!outputFile || !extensionId || !scenario) {
		throw new Error('Missing activation benchmark environment variables');
	}
	const extension = vscode.extensions.getExtension(extensionId);
	if (!extension) {
		throw new Error(
			`Extension ${extensionId} is not available in the host`,
		);
	}
	const beforeHeap = process.memoryUsage().heapUsed;
	const activatedBeforeProbe = extension.isActive;
	const probeStarted = performance.now();
	await extension.activate();
	const activationProbeMs = performance.now() - probeStarted;
	const afterHeap = process.memoryUsage().heapUsed;
	let workUnits = 0;
	if (extensionId === 'cartago.mcp-vertex-vscode') {
		try {
			const modulePath = join(
				extension.extensionPath,
				'dist',
				'extension.js',
			);
			const extensionModule = require(modulePath);
			const handle = extensionModule.getRuntimeHandle?.();
			if (typeof handle?.count === 'number') {
				workUnits = handle.count;
			}
		} catch {
			workUnits = 0;
		}
	}
	let observedToolCalls = null;
	let observedToolCallsEvidence = 'missing-artifact';
	const callLogPath = process.env.MCP_VERTEX_BENCH_CALL_LOG;
	if (callLogPath) {
		try {
			const raw = await readFile(callLogPath, 'utf8');
			const lines = raw
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			if (lines.length > 0) {
				observedToolCalls = lines.length;
				observedToolCallsEvidence = 'artifact';
			}
		} catch {
			observedToolCalls = null;
			observedToolCallsEvidence = 'missing-artifact';
		}
	}
	await writeFile(
		outputFile,
		JSON.stringify(
			{
				scenario,
				activationProbeMs,
				heapUsedBytes: afterHeap,
				heapDeltaBytes: afterHeap - beforeHeap,
				workUnits,
				activatedBeforeProbe,
				activationEvents: Array.isArray(
					extension.packageJSON.activationEvents,
				)
					? extension.packageJSON.activationEvents
					: [],
				observedToolCalls,
				observedToolCallsEvidence,
			},
			null,
			2,
		),
	);
}

module.exports = { run };
