import { pathToFileURL } from 'node:url';
const root = pathToFileURL(`${process.cwd()}/`);
const { consolidateAudits } = await import(
	new URL('plugins/audit/src/lib/services/audit-consolidate.service.ts', root)
		.href
);
const base = { slug: 'fixture', summary: '', scores: [], note: '' };
const docs = [
	{
		...base,
		path: 'a.md',
		source: { model: 'Model A', host: 'fixture', date: '2026-10-19' },
		findings: [
			{
				id: 'fatal-1',
				title: 'Same unsafe path handling',
				severity: 'FATAL',
				files: ['plugins/example/src/path.ts'],
				detail: 'same issue',
			},
		],
	},
	{
		...base,
		path: 'b.md',
		source: { model: 'Model B', host: 'fixture', date: '2026-10-19' },
		findings: [
			{
				id: 'bad-1',
				title: 'Same unsafe path handling',
				severity: 'BAD',
				files: ['plugins/example/src/path.ts'],
				detail: 'same issue',
			},
		],
	},
];
console.log(JSON.stringify(consolidateAudits(docs)));
