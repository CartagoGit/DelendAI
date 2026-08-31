---
id: a00086
title: "auditoría: barrido de seguridad y privacidad (browser, container, forge, database, api, external-mcps, ...)"
kind: audit
status: done
type: proposal
track: plugin-hardening
date: 2026-08-24
shipped-in: [ede97e6e2]
last-transition-id: 9cc9aca9-af65-4008-92b7-243af5f527aa
last-correlation-id: 9cc9aca9-af65-4008-92b7-243af5f527aa
last-transition-from: review
---

# a00086 — auditoría: barrido de seguridad y privacidad (browser, container, forge, database, api, external-mcps, ...)

## Goal

Auditar los plugins de mayor superficie de seguridad/privacidad, siguiendo el checklist §24 de la auditoría legada, y convertir solo los hallazgos demostrables en fixes.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md` + §30 (modelo de privacidad).

Ejes de revisión por grupo (cada hallazgo se marca `confirmed / probable / not reproducible / already fixed / accepted risk`):

- **browser, web-fetch, link-check**: sandbox, network boundaries, redirects, DNS rebinding, allowlist, localhost/private networks, downloads, secrets en page content/logs.
- **container, forge, git**: command safety (Docker/K8s), process tree timeout, socket access, operaciones destructivas, resets, writes, huge diffs/binarios.
- **database, env, api, security**: read-only guarantees, credenciales/connection strings, NUNCA devolver secret values, SSRF, redirects, auth headers, CVE network behavior.
- **external-mcps, logs, observability, orchestrator-runner**: trust boundary, capability import, namespace conflicts, redaction, PII accidental, process lifecycle, token fan-out.

La auditoría es trabajo de lectura de código (no solo comandos): se documenta archivo+línea y se propone fix solo con evidencia.

## why

La auditoría legada revisa los 43 plugins como checklist, no como sentencia. Este barrido de seguridad/privacidad convierte la parte de mayor riesgo en hallazgos verificables que alimentan fixes con evidencia.

## non-goals

- No 'arreglar' observaciones no reproducibles.
- No tocar código en esta propuesta (solo hallazgos + propuestas hijas derivadas).
- No cubrir error-reporting (track privacy dedicado).

## Slices

- global_gate: none

### S1 — Auditar browser/web-fetch/link-check
- **Status**: done
- **Files**: `plugins/browser/**`, `plugins/web-fetch/**`, `plugins/link-check/**`
- **Gate**: none
- acceptance:
  - "Cada eje revisado con evidencia archivo+línea; hallazgos clasificados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada de peer review 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652.
### S2 — Auditar container/forge/git
- **Status**: done
- **Files**: `plugins/container/**`, `plugins/forge/**`, `plugins/git/**`
- **Gate**: none
- acceptance:
  - "Destructivas, process tree, socket y writes revisados; hallazgos clasificados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S3 — Auditar database/env/api/security
- **Status**: done
- **Files**: `plugins/database/**`, `plugins/env/**`, `plugins/api/**`, `plugins/security/**`
- **Gate**: none
- acceptance:
  - "Read-only, credenciales, secret values, SSRF/redirects y CVE network revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S4 — Auditar external-mcps/logs/observability/orchestrator-runner
- **Status**: done
- **Files**: `plugins/external-mcps/**`, `plugins/logs/**`, `plugins/observability/**`, `plugins/orchestrator-runner/**`
- **Gate**: none
- acceptance:
  - "Trust boundary, PII, redaction y lifecycle de procesos revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
## acceptance

- Cada eje revisado con evidencia archivo+línea; hallazgos clasificados.
- Destructivas, process tree, socket y writes revisados; hallazgos clasificados.
- Read-only, credenciales, secret values, SSRF/redirects y CVE network revisados.
- Trust boundary, PII, redaction y lifecycle de procesos revisados.

## verified state

S1 (browser/web-fetch/link-check) verificado por lectura de código el 2026-08-24:
- `plugins/web-fetch/src/lib/services/engine.ts` — allow-list por hostname, fail-closed, redirects manuales re-validados por hop, cap de bytes en streaming con `reader.cancel()`, techos duros en `sanitizeBounds`.
- `plugins/web-fetch/src/index.ts` — allow-list vacío = rechaza todo; options validadas con zod.
- `plugins/browser/src/lib/page/planner.ts` — valida protocolo HTTP(S) y rechaza credenciales embebidas.
- `plugins/browser/src/lib/page/playwright-probe.ts` — no bundlea Playwright; falla suave con hint de instalación.
- `plugins/link-check/src/lib/link-check/check-links.ts` — puro, nunca fetchea enlaces externos; `real-deps.ts` solo lee archivos locales.

S2 (container/forge/git) verificado por lectura de código el 2026-08-24:
- `plugins/forge/src/lib/exec.ts` — `spawn` argv-first (sin shell), timeout 15s con `SIGTERM`, redacción de tokens `gh*`/`glpat`.
- `plugins/container/src/lib/tools/container-build.tool.ts` — mutaciones (`container_build`, `k8s_apply`) gated por `confirm: true`/`dryRun`; argv-first vía `runExternalTool`; manifest k8s por stdin + redacción de `data.kubernetes.io/*`.
- `packages/core/src/lib/external-tool/run-external-tool.ts` — envuelve `runArgv` (no shell, timeout, output acotado) + redactor.
- `plugins/git/src/lib/tools/write-tools.ts` — `git_push` rechaza `--force` plano, `+refspec` y ramas protegidas.
- `plugins/forge/src/lib/services/forge-write.ts` / `forge-release.ts` — writes/release requieren `confirm: true`.

S3 (database/env/api/security) verificado por lectura de código el 2026-08-24:
- `plugins/database/src/lib/query/query-engine.ts` — `executeGuardedQuery` clasifica read/write/ddl y **rechaza** mutaciones sin `allowWrite:true && confirm:true`; errores pasan por `redactDsn`.
- `plugins/env/src/lib/env/check-env.ts` — puro, reporta solo nombres de clave (nunca valores).
- `plugins/api/src/lib/tools/api-call.tool.ts` — envía vía `webFetch` allow-listado; `specUrl` exige `allowList`.
- `plugins/security/src/lib/secrets/scan-secrets.ts` — redacta el match (head+tail) para no filtrar el secreto.

S4 (external-mcps/logs/observability/orchestrator-runner) verificado por lectura de código el 2026-08-24:
- `plugins/external-mcps/src/lib/subprocess/env-filter.ts` — `buildSafeEnv` construye un env **allow-listado** (no pasa el env completo del host a servidores de terceros).
- `plugins/logs/src/lib/services/normalize-event.ts` — `redactSecrets` en summary y redacción recursiva en `serializeRedactedEvent`.
- `plugins/observability/src/lib/errors/list-errors.ts` — `redactToken`/`redactSecrets` + truncado a 240 chars.
- `plugins/orchestrator-runner/src/lib/quota.ts` — write durable `withFileMutex → redactSecrets → writeFileAtomic`; token HMAC ya ligado a provider+tier (a00085 #5 / x00204).

## findings

### 1. [confirmed · media] web-fetch: el allow-list no restringe puerto

**File**: `plugins/web-fetch/src/lib/services/engine.ts#L204`

```typescript
if (!isHostAllowed(currentUrl.hostname, options.allowList)) {
```

`isHostAllowed` (`engine.ts#L103-L113`) compara solo `hostname`, no `hostname:port`:

```typescript
export const isHostAllowed = (
    hostname: string,
    allowList: readonly string[],
): boolean => {
    const lower = hostname.toLowerCase();
    return allowList.some((entry) => { /* exact or *.suffix */ });
};
```

**Problem**: si `example.com` está allow-listado, `web_fetch { url: "http://example.com:6379" }` (o cualquier otro puerto) también pasa. El allow-list delimita el host, no el servicio: un host de confianza que además exponga un servicio no-HTTP (Redis, Elasticsearch, Docker daemon…) queda alcanzable por SSRF.

**Classification**: confirmed. Frontera SSRF más débil de lo que sugiere el contrato del allow-list.

**Fix propuesto (hija `x`)**: restringir el puerto permitido (por defecto 80/443) o extender el allow-list a entradas `host:port`.

### 2. [accepted risk] web-fetch: rebinding DNS y resolución a nivel de host

**File**: `plugins/web-fetch/src/lib/services/engine.ts#L13-L24` (doc header)

El propio header documenta que la mitigación SSRF cubre el **hostname** y deja explícitamente fuera las preocupaciones a nivel de host (rebinding DNS, resolución de IP). El allow-list es por string de hostname; la resolución DNS la hace `fetch` en el momento de la petición.

**Classification**: accepted risk (documentado). El host que expone un fetch real debe pin/egress-filter a nivel de red.

### 3. [already fixed] web-fetch: redirects re-validados por hop

**File**: `plugins/web-fetch/src/lib/services/engine.ts#L204` (dentro del bucle) y `#L243` (`redirect: 'manual'`)

Cada hop resuelve `Location` manualmente y re-chequea `isHostAllowed` antes de seguir. Un redirect a un host no allow-listado devuelve `redirect-blocked`.

**Classification**: already fixed.

### 4. [not reproducible] browser / link-check: sin superficie SSRF adicional

- `plugins/browser/src/lib/page/planner.ts` valida protocolo HTTP(S) y **rechaza credenciales embebidas** (`parsed.username/password`), con caps de longitud y `maxResults`.
- `plugins/link-check/src/lib/link-check/check-links.ts` es **puro** y nunca fetchea enlaces externos; `real-deps.ts` solo hace `readFile` de docs locales.

**Classification**: not reproducible (sin vector SSRF en estos dos plugins).

### 5. [already fixed] S2: ejecución de comandos argv-first (sin shell) en forge/container/git

- `plugins/forge/src/lib/exec.ts#L76-L84` — `spawn(cli, args, { stdio: 'pipe' })`: los args van como array, nunca interpolados en un shell. Timeout 15s con `child.kill('SIGTERM')`.
- `packages/core/src/lib/external-tool/run-external-tool.ts#L49-L70` — `runExternalTool` envuelve `runArgv` (argv-first, no shell, timeout, `maxOutputBytes` acotado). El comentario de `external-tool.interface.ts` lo fija: "Literal argv appended after the binary — never shell-parsed".
- `plugins/container/src/lib/logs/run-logs.ts#L26-L38` — `docker logs` se construye como array de argv (`['docker','logs',container,'--tail',…,'--since',since]`).

**Classification**: already fixed. Sin inyección de shell en los tres plugins.

### 6. [already fixed] S2: mutaciones gated por `confirm: true`

- `plugins/container/src/lib/tools/container-build.tool.ts#L32-L34` — `REQUIRE_CONFIRM` rechaza `container_build`/`k8s_apply` sin `confirm: true` o `dryRun: true` (default refuses).
- `plugins/forge/src/lib/services/forge-write.ts#L350`/`#L439`/`#L475` y `forge-release.ts#L95` — toda escritura/release requiere `confirm: true`.
- `plugins/git/src/lib/tools/write-tools.ts#L232-L262` — `git_push` rechaza `+refspec` (force embebido), `--force` plano (solo `--force-with-lease`) y push a ramas protegidas (`main`/`master`), incluido el push implícito de la rama actual.

**Classification**: already fixed. Destructivas y writes con gate explícito.

### 7. [not reproducible] S2: sin acceso a sockets ni resets destructivos sin guard

No se encontró en `container`/`forge`/`git` acceso directo a sockets ni un `git reset --hard`/`clean -f` expuesto como tool sin guard. El surface de mutación está cubierto por los gates de los puntos 5-6.

**Classification**: not reproducible.

### 8. [confirmed · media] S3: `api_call` devuelve los headers completos de la petición (fuga de Authorization)

**File**: `plugins/api/src/lib/tools/api-call.tool.ts#L186-L194`

```typescript
return toolJson({
    request,          // ← incluye request.headers
    response: { ... },
    specTitle: spec.title,
    parseNote: spec.parseNote,
});
```

`buildHeaders` (`plugins/api/src/lib/spec/build-request.ts#L73-L88`) mete **todos** los header params (incluida cualquier `Authorization`) en `headers`, y el `OUTPUT` del tool declara `request.headers: z.record(z.string(), z.string())` sin redacción. La descripción del tool promete: "secrets are never logged".

**Problem**: si el agente pasa el token vía `params` con un header param (como la propia descripción sugiere: "Auth comes from the request headers"), el token vuelve en `output.request.headers` y queda en el transcript/logs del agente. Contradice el contrato documentado.

**Classification**: confirmed. Fuga de secretos al output (medio: es el token que el propio agente suministró, pero persiste en logs/transcript).

**Fix propuesto (hija `x`)**: redactar `authorization`/`cookie`/`x-api-key` en el `request.headers` del output (o devolver solo los headers no sensibles).

### 9. [already fixed] S3: database read-only por defecto + DSN redactado

**File**: `plugins/database/src/lib/query/query-engine.ts#L337-L348`

```typescript
export const executeGuardedQuery = async (...) => {
    ...
    !(input.allowWrite === true && input.confirm === true)
```

Las mutaciones se rechazan (`write-refused`/`ddl-refused`) salvo `allowWrite:true && confirm:true`. Los errores pasan por `redactDsn` (`query-engine.ts#L333`/`#L389`), así una cadena de conexión en el mensaje de error queda redactada.

**Classification**: already fixed.

### 10. [already fixed] S3: env check nunca filtra valores

**File**: `plugins/env/src/lib/env/check-env.ts#L1-L7` (doc) y `#L85-L105`

`checkEnv` reporta solo `entry.key` y número de línea; nunca incluye `entry.value` en los findings. El doc header lo fija: "never leaks a value (only key names are reported)".

**Classification**: already fixed.

### 11. [already fixed] S4: external-mcps no pasa el env completo a servidores de terceros

**File**: `plugins/external-mcps/src/lib/subprocess/env-filter.ts#L52-L98`

`buildSafeEnv` parte de `BASE_ALLOW_LIST` (PATH, HOME, TMPDIR, LANG, …) y solo añade las claves `requiredKeys`/`optionalKeys` declaradas y las de `entry.env` (con `$VAR` resuelto contra el host). No hay passthrough del env completo: un servidor MCP externo no recibe `AWS_*`/`GITHUB_TOKEN`/etc. salvo que se declare explícitamente.

**Classification**: already fixed. Trust boundary correcto.

### 12. [already fixed] S4: redacción de PII/secretos en logs, observability y quota

- `plugins/logs/src/lib/services/normalize-event.ts#L160` — `redactSecrets(summarySource).text.slice(0, 200)`; y `serializeRedactedEvent` redacta recursivamente todo string (incluido `meta`) antes de serializar.
- `plugins/observability/src/lib/errors/list-errors.ts#L1-L20` — `listRecentErrors` redacta tokens de la respuesta (defence in depth) y `truncate` a 240 chars.
- `plugins/security/src/lib/secrets/scan-secrets.ts#L24-L25` — `redact` muestra solo head+tail del match para no filtrar el secreto.
- `plugins/orchestrator-runner/src/lib/quota.ts#L22` — `withFileMutex → redactSecrets → writeFileAtomic`.

**Classification**: already fixed. La redacción está en el camino de escritura/serialización, no solo en el handler.

## scoreboard

| Severidad | Conteo |
|---|---|
| alta | 0 |
| media | 2 |
| baja | 0 |
