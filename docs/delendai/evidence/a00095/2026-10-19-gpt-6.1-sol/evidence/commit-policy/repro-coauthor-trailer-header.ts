import { appendAuditTrailer } from '../../../../../../../plugins/commit-policy/src/lib/audit/trailer';

const input =
	'fix: retain release note\n\nSigned-off-by: Ada <ada@example.test>\nReviewed-by: Bo <bo@example.test>';
const output = appendAuditTrailer(input, 'co-authored-by', '${host}/${model}', {
	host: 'delendai',
	model: 'gpt-test',
});

console.log(
	JSON.stringify(
		{
			input,
			output,
			conventionalHeaderPreserved: output.startsWith(
				'fix: retain release note',
			),
			signedOffTrailerPreserved: output.includes('Signed-off-by: Ada'),
		},
		null,
		2,
	),
);
