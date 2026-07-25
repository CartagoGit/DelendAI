# @mcp-vertex/api

OpenAPI-aware request building and contract validation on top of the shared web-fetch engine.

## api_validate

`api_validate` checks a decoded JSON response against the success response schema for one OpenAPI operation. It does not send requests; it only validates the response object the host already has.

Example:

```ts
{
	operationId: 'getUser',
	response: {
		id: 42,
		email: 'ada@example.com',
		profileUrl: 'https://example.com/users/42'
	},
	specUrl: 'https://api.example.com/openapi.json',
	allowList: ['api.example.com']
}
```

Success output shape:

```ts
{
	ok: true,
	operationId: 'getUser',
	findings: [
		{
			ruleId: 'format-mismatch',
			severity: 'medium',
			message: '$.email: expected format email but received "not-an-email".',
			fix: 'Provide a value that matches the email format.'
		}
	],
	summary: {
		critical: 0,
		high: 0,
		medium: 1,
		low: 0,
		info: 0
	},
	worst: 'medium'
}
```

Covered mismatch classes:

- Missing required fields
- Primitive / object / array type mismatches
- Enum drift
- Email and URI format errors
- Nullable fields
- Nested object and array validation
- Extra properties when the schema closes the object with `additionalProperties: false`

If no spec is available, the `operationId` is unknown, or an allow-listed `specUrl` cannot be loaded, the tool returns the standard `toolError` envelope with an actionable `nextAction` hint.