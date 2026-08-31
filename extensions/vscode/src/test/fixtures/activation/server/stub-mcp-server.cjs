const fs = require('node:fs');

const callLogPath = process.env.MCP_VERTEX_BENCH_CALL_LOG;

const appendCall = (payload) => {
	if (typeof callLogPath !== 'string' || callLogPath.length === 0) return;
	fs.appendFileSync(callLogPath, `${JSON.stringify(payload)}\n`);
};

const write = (message) => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

const ok = (id, result) => write({ jsonrpc: '2.0', id, result });

const toolResult = (content) => ({
	content: [{ type: 'text', text: JSON.stringify(content) }],
	structuredContent: content,
	_isError: false,
});

process.stdin.setEncoding('utf8');
let buffer = '';

const handleMessage = (message) => {
	if (!message || typeof message !== 'object') return;
	const { id, method, params } = message;
	if (method === 'initialize') {
		ok(id, {
			protocolVersion: '2024-11-05',
			capabilities: { tools: {} },
			serverInfo: { name: 'benchmark-stub', version: '0.0.0' },
		});
		return;
	}
	if (method === 'notifications/initialized') {
		return;
	}
	if (method === 'tools/list') {
		ok(id, {
			tools: [
				{
					name: 'mcp-vertex_overview',
					description: 'Benchmark overview tool',
					inputSchema: {
						type: 'object',
						properties: {
							compact: { type: 'boolean' },
						},
					},
				},
			],
		});
		return;
	}
	if (method === 'tools/call') {
		appendCall({ name: params?.name ?? 'unknown' });
		if (params?.name === 'mcp-vertex_overview') {
			ok(
				id,
				toolResult({
					server: { name: 'mcp-vertex', version: '0.1.0' },
					namespacePrefix: 'mcp-vertex',
					plugins: ['core'],
					tools: ['mcp-vertex_overview'],
					knowledge: [],
					recommendedNextAction: 'Benchmark stub',
				}),
			);
			return;
		}
		ok(id, toolResult({ ok: true }));
		return;
	}
	if (id !== undefined) {
		ok(id, {});
	}
};

process.stdin.on('data', (chunk) => {
	buffer += chunk;
	let newlineIndex = buffer.indexOf('\n');
	while (newlineIndex >= 0) {
		const line = buffer.slice(0, newlineIndex).trim();
		buffer = buffer.slice(newlineIndex + 1);
		if (line.length > 0) {
			try {
				handleMessage(JSON.parse(line));
			} catch {}
		}
		newlineIndex = buffer.indexOf('\n');
	}
});
