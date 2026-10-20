import { pathToFileURL } from 'node:url';
const root = pathToFileURL(`${process.cwd()}/`);
const { buildSelfAuditRegistration } = await import(
	new URL('plugins/audit/src/lib/tools/self-audit.tool.ts', root).href
);

const finding = (ruleId: string, message: string) => ({
	ruleId,
	severity: 'high' as const,
	message,
});
const run = (tool: string, item: ReturnType<typeof finding>) => async () => ({
	tool,
	findings: [item],
	summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
	ranAt: '2026-10-19T00:00:00.000Z',
});
const scanners = new Map([
	[
		'security',
		{
			ref: { id: 'sec', label: 'Security', capability: 'security' },
			run: run('sec', finding('SEC-1', 'security finding')),
		},
	],
	[
		'perf',
		{
			ref: { id: 'perf', label: 'Performance', capability: 'perf' },
			run: run('perf', finding('PERF-1', 'performance finding')),
		},
	],
]);
let handler: ((args: unknown) => Promise<unknown>) | undefined;
await buildSelfAuditRegistration({
	namespacePrefix: 'audit',
	workspaceRootAbs: process.cwd(),
	scanners,
}).register({
	registerTool: (
		_name: string,
		_schema: unknown,
		fn: (args: unknown) => Promise<unknown>,
	) => {
		handler = fn;
	},
} as never);
const result = await handler!({ limit: 10, capabilities: ['security'] });
console.log(JSON.stringify(result));
