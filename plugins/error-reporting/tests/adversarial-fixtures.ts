import type { IEnvironmentClass, ISafeMcpFrame } from '../src/public/index';

export interface IAdversarialProjectFixture {
	readonly projectId: 'project-a' | 'project-b';
	readonly stackLines: readonly string[];
	readonly privateMarkers: readonly string[];
	readonly privateMessage: string;
}

const hugePrivateBlob = '秘密客户-Ωmega-🚫-LEAK-'.repeat(700);

const sharedPrivateMarkers = {
	awsKey: 'AKIAIOSFODNN7EXAMPLE',
	githubPat: 'ghp_superSecretPrivateToken1234567890',
	jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZUBhY21lLmNvbSIsInRlbmFudCI6ImFjbWUtaW50ZXJuYWwifQ.signature',
	openAiKey: 'sk-private-openai-1234567890abcdefghijkl',
	anthropicKey: 'sk-ant-private-abcdefghijklmnopqrstuv',
	postgresUrl:
		'postgres://alice:pa55w0rd@db.internal.acme.local:5432/customer_ops',
	mongoUrl:
		'mongodb+srv://root:ultraSecret@cluster0.private.mongodb.net/admin',
	internalUrl: 'https://grafana.internal.acme.local/d/tenant-secrets',
	privateIpA: '10.0.0.5',
	privateIpB: '192.168.1.1',
	privateEmail: 'alice@acme.com',
	companyName: 'Contoso Biosciences',
	clientName: 'client-x stealth launch',
	privateRepo: 'github.com/acme/private-monorepo',
	jsonFragment:
		'{"tenant":"acme-internal","email":"alice@acme.com","token":"ghp_superSecretPrivateToken1234567890"}',
	sqlFragment:
		"SELECT * FROM customers WHERE tenant = 'acme-internal' AND email = 'alice@acme.com';",
	graphqlFragment:
		'mutation RotateKey { rotateKey(tenant: "acme-internal", token: "sk-private-openai-1234567890abcdefghijkl") }',
	sourceFragment:
		'const leaked = process.env.OPENAI_API_KEY ?? "sk-private-openai-1234567890abcdefghijkl";',
	unicodeSecret: '顧客-機密-東京-Ωmega-🚫',
	hugePrivateBlobSample: hugePrivateBlob.slice(0, 512),
} as const;

const projectAMessage = [
	'Unexpected failure while processing private tenant metadata.',
	sharedPrivateMarkers.jsonFragment,
	sharedPrivateMarkers.sqlFragment,
	sharedPrivateMarkers.graphqlFragment,
	sharedPrivateMarkers.sourceFragment,
	sharedPrivateMarkers.privateRepo,
	sharedPrivateMarkers.unicodeSecret,
	hugePrivateBlob,
].join('\n');

const projectBMessage = [
	'Host payload carried consumer-only secrets and must never leak.',
	'{"tenant":"globex-secret","email":"carol@globex.example","url":"http://10.0.0.5/internal"}',
	'mutation PublishInvoice { publishInvoice(tenant: "globex-secret", ip: "192.168.1.1") }',
	"SELECT password FROM admins WHERE tenant = 'globex-secret';",
	'function bootstrap() { return fetch("http://192.168.1.1/internal"); }',
	'Cliente confidencial: Umbrella Health / Carol / C:\\Users\\Carol\\work\\secret',
	hugePrivateBlob,
].join('\n');

export const EXPECTED_SAFE_MCP_FRAMES: readonly ISafeMcpFrame[] = [
	{
		file: '@delendai/error-reporting/dist/index.js',
		line: 71,
		col: 15,
		fn: 'createIssue',
	},
	{
		file: '@delendai/core/dist/error-boundary.js',
		line: 28,
		col: 7,
		fn: 'reduceFailure',
	},
] as const;

export const FIXED_ENVIRONMENT_CLASS: IEnvironmentClass = {
	runtime: 'bun',
	platformFamily: 'linux',
};

export const FIXED_MCP_VERTEX_VERSION = '9.8.7';
export const FIXED_REPORTER_VERSION = '1.2.3';
export const FIXED_SAFE_TOOL_ID = '@delendai/error-reporting.report_status';

export const PROJECT_A_FIXTURE: IAdversarialProjectFixture = {
	projectId: 'project-a',
	stackLines: [
		'    at loadTenantConfig (/Users/alice/client-x/repos/acme-private/src/config.ts:31:9)',
		'    at createIssue (/Users/alice/client-x/repos/acme-private/node_modules/@delendai/error-reporting/dist/index.js:71:15)',
		'    at reduceFailure (/Users/alice/client-x/repos/acme-private/node_modules/@delendai/core/dist/error-boundary.js:28:7)',
		'    at resolveGraph (/home/bob/acme/services/graphql.ts:88:12)',
	],
	privateMarkers: [
		'/Users/alice/client-x/repos/acme-private/src/config.ts',
		'/home/bob/acme/services/graphql.ts',
		sharedPrivateMarkers.awsKey,
		sharedPrivateMarkers.githubPat,
		sharedPrivateMarkers.jwt,
		sharedPrivateMarkers.openAiKey,
		sharedPrivateMarkers.anthropicKey,
		sharedPrivateMarkers.postgresUrl,
		sharedPrivateMarkers.mongoUrl,
		sharedPrivateMarkers.internalUrl,
		sharedPrivateMarkers.privateIpA,
		sharedPrivateMarkers.privateIpB,
		sharedPrivateMarkers.privateEmail,
		sharedPrivateMarkers.companyName,
		sharedPrivateMarkers.clientName,
		sharedPrivateMarkers.privateRepo,
		sharedPrivateMarkers.jsonFragment,
		sharedPrivateMarkers.sqlFragment,
		sharedPrivateMarkers.graphqlFragment,
		sharedPrivateMarkers.sourceFragment,
		sharedPrivateMarkers.unicodeSecret,
		sharedPrivateMarkers.hugePrivateBlobSample,
	],
	privateMessage: [
		projectAMessage,
		sharedPrivateMarkers.awsKey,
		sharedPrivateMarkers.githubPat,
		sharedPrivateMarkers.jwt,
		sharedPrivateMarkers.openAiKey,
		sharedPrivateMarkers.anthropicKey,
		sharedPrivateMarkers.postgresUrl,
		sharedPrivateMarkers.mongoUrl,
		sharedPrivateMarkers.internalUrl,
		sharedPrivateMarkers.privateIpA,
		sharedPrivateMarkers.privateIpB,
		sharedPrivateMarkers.privateEmail,
		sharedPrivateMarkers.companyName,
		sharedPrivateMarkers.clientName,
	].join('\n'),
};

export const PROJECT_B_FIXTURE: IAdversarialProjectFixture = {
	projectId: 'project-b',
	stackLines: [
		'    at loadTenantConfig (C:\\Users\\Carol\\work\\secret\\globex-erp\\src\\config.ts:31:9)',
		'    at createIssue (/srv/ci/umbrella-private/node_modules/@delendai/error-reporting/dist/index.js:71:15)',
		'    at reduceFailure (/srv/ci/umbrella-private/node_modules/@delendai/core/dist/error-boundary.js:28:7)',
		'    at connectDb (C:\\Users\\Carol\\work\\secret\\globex-erp\\services\\db.ts:88:12)',
	],
	privateMarkers: [
		'C:\\Users\\Carol\\work\\secret\\globex-erp\\src\\config.ts',
		'C:\\Users\\Carol\\work\\secret\\globex-erp\\services\\db.ts',
		'carol@globex.example',
		'http://10.0.0.5/internal',
		'http://192.168.1.1/internal',
		'Umbrella Health',
		'globex-secret',
		sharedPrivateMarkers.awsKey,
		sharedPrivateMarkers.githubPat,
		sharedPrivateMarkers.jwt,
		sharedPrivateMarkers.openAiKey,
		sharedPrivateMarkers.anthropicKey,
		sharedPrivateMarkers.postgresUrl,
		sharedPrivateMarkers.mongoUrl,
		sharedPrivateMarkers.internalUrl,
		sharedPrivateMarkers.privateIpA,
		sharedPrivateMarkers.privateIpB,
		sharedPrivateMarkers.privateEmail,
		sharedPrivateMarkers.companyName,
		sharedPrivateMarkers.clientName,
		sharedPrivateMarkers.privateRepo,
		sharedPrivateMarkers.hugePrivateBlobSample,
	],
	privateMessage: [
		projectBMessage,
		sharedPrivateMarkers.awsKey,
		sharedPrivateMarkers.githubPat,
		sharedPrivateMarkers.jwt,
		sharedPrivateMarkers.openAiKey,
		sharedPrivateMarkers.anthropicKey,
		sharedPrivateMarkers.postgresUrl,
		sharedPrivateMarkers.mongoUrl,
		sharedPrivateMarkers.internalUrl,
		sharedPrivateMarkers.privateIpA,
		sharedPrivateMarkers.privateIpB,
	].join('\n'),
};

export const ALL_PRIVATE_MARKERS = [
	...PROJECT_A_FIXTURE.privateMarkers,
	...PROJECT_B_FIXTURE.privateMarkers,
] as const;
