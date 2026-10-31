# @delendai/api

OpenAPI-aware request building, contract validation, and mock generation on top of the shared allow-listed web-fetch engine.

The plugin ships three tools — `api_call`, `api_validate`, and `api_mock` — all sharing the same `IJsonSchema` shape so the parser, the validator, and the mock generator never disagree on what a schema means.

## Catalog

| Tool | Description | Network |
| --- | --- | --- |
| `api_call` | Parse an OpenAPI spec, build a request, dispatch through the allow-listed web-fetch engine. | yes (allow-list) |
| `api_validate` | Check a decoded JSON response against the success response schema for one operation. | no |
| `api_mock` | Generate a deterministic example response for one operation from the spec, no live server needed. | no |

Pack membership: `backend-api` — the API plugin ships alongside `database`, `browser`, and `observability` in the backend-api preset pack.

## api_call

Parse an OpenAPI 3.x spec (inline or fetched from an allow-listed URL) and dispatch a single operation through the shared web-fetch engine.

```ts
{
	operationId: 'getUser',
	params: { id: 42 },
	baseUrl: 'https://api.example.com',
	allowList: ['api.example.com']
}
```

The tool returns the parsed spec, the built request, and the web-fetch envelope so the host can audit exactly what was sent.

## api_validate

`api_validate` checks a decoded JSON response against the success response schema for one OpenAPI operation. It does not send requests; it only validates the response object the host already has.

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

## api_mock

`api_mock` generates a deterministic example response for one OpenAPI operation directly from the parsed spec — no live server, no network. It is useful for local development, contract-test seeds, and documentation stubs.

```ts
{
	operationId: 'createUser',
	statusCode: 201,
	specUrl: 'https://api.example.com/openapi.json',
	allowList: ['api.example.com'],
	count: 3
}
```

Success output shape:

```ts
{
	ok: true,
	operationId: 'createUser',
	count: 3,
	responses: [
		{
			status: 201,
			contentType: 'application/json',
			body: {
				id: 42,
				email: 'user@example.com',
				createdAt: '1970-01-01T00:00:00.000Z'
			}
		}
	]
}
```

Semantics:

- The same spec + options always produce the same body, so unit tests can assert exact output. `randomize: true` mixes the operationId + path + status into the seed between calls instead — useful when the host wants fresh-looking payloads.
- Type-driven defaults: `string` → `""` (or `example` / `enum[0]`), `integer` / `number` → `0`, `boolean` → `false`, `array` → `[]`, `object` → `{}`. Nested objects and arrays are walked recursively.
- `required` is honored: missing required fields are stubbed with the type-driven default rather than omitted.
- `enum` always picks the first listed value unless the schema provides an `example`.
- `format` is honored where recognized (`email`, `uri`, `date-time`, `uuid`) — otherwise the generator falls back to the primitive default.
- Pass `count` to receive a list of `count` unique mocks (capped at 32 to keep the response bounded).

If no spec is available, the `operationId` is unknown, or the requested `statusCode` has no declared response, the tool returns the standard `toolError` envelope with an actionable `nextAction` hint.

## Engine

All three tools ride the same `IJsonSchema` shape produced by the S1 parser. The S2 validator and the S3 mock generator walk the same shape, so a schema that the validator accepts will always produce a mock that the validator would accept too.

Network access is gated by the shared web-fetch allow-list. Mutating verbs (`POST`, `PUT`, `PATCH`, `DELETE`) require the same consent web-fetch demands — `api_mock` and `api_validate` never issue mutating calls because they are pure functions over the parsed spec.
