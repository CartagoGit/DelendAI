import { appendAuditTrailer } from '../../../../../../../plugins/commit-policy/src/lib/audit/trailer';

const output = appendAuditTrailer(
	'fix: x',
	'body-metadata',
	'${host}/${model}',
	{ host: 'host"quoted', model: 'model' },
);
const block = /```json\n([\s\S]*?)\n```/u.exec(output)?.[1] ?? '';
let jsonValid = true;
try {
	JSON.parse(block);
} catch {
	jsonValid = false;
}
console.log(JSON.stringify({ output, jsonValid }, null, 2));
