---
id: x00072
kind: fix
title: "SEC-001 · Workspace Trust + aprobación de comando para la extensión VS Code"
status: done
type: proposal
track: security+invariants+ide
date: 2026-07-25
related:
  - a00070 # intake auditoría externa
  - a00071 # auditoría independiente
closed-by: copilot-minimax-m3
closed-evidence:
  - S1: 333a55f9 fix(x00072): SEC-001 S1 gate stdio child on workspace trust
  - S2: 42929268 fix(x00072): SEC-001 S2 trust fingerprint + QuickPick gate
  - S3: ccc575f8 fix(x00072): type the S2/S3 trust-gate specs and unblock assign

---

# x00072 — SEC-001 · Workspace Trust + aprobación de comando para la extensión VS Code

## Goal

Bloquear la ejecución de cualquier comando controlado por el workspace
(`mcpServers.mcp-vertex`) en repositorios no confiables; exigir aprobación humana
ligada a una huella del comando cuando sí lo sean; separar discover de start;
añadir tests de integración.

Concretamente:

1. Declinar el autoarranque cuando `vscode.workspace.isTrusted === false` y
   declarar `capabilities.untrustedWorkspaces.supported: false` en
   `package.json`.
2. Mostrar un `QuickPick`/diálogo con `command`, `args`, `cwd`, y resumen legible
   antes del primer spawn. Persistir una aprobación ligada a
   `sha256(command+args+cwd)` en `globalState`. Invalidar la aprobación si el
   contenido del `.mcp.json` cambia.
3. Separar `discover` (lee `.mcp.json` y proyecta un resumen) de `start`
   (arranca el child) — el host debe llamar `start` solo tras aprobación o en
   trusted + huella cacheada.
4. Tests de integración: workspace confiable, no confiable, comando modificado,
   cancelación.

## why

Las auditorías `a00070` (intake del informe externo CartagoGit/mcp-vertex) y
`a00071` (auditoría interna independiente) confirman el crítico **C-01**: la
extensión se activa con `workspaceContains:**/mcp-vertex.config.json`, lee
`.mcp.json` del repo y arranca el proceso vía `McpStdioClient.connect(...)`
sin checar `isTrusted`, sin declarar `untrustedWorkspaces`, y sin aprobación
explícita. Un repositorio malicioso consigue RCE al abrirlo en VS Code.

Este fix es la primera puerta antes de declarar el host confiable en
workspaces untrusted.

## non-goals

- No migrar la aprobación a Webview — usar VS Code `QuickPick`/`InputBox`
  nativo y una entrada en `globalState`.
- No firmar ni distribuir el config del workspace.
- No tocar el protocolo MCP; solo el host-side.
- No desactivar completamente la extensión en untrusted — solo el autoarranque
  del child. La UI puede seguir mostrando estado/discover.

## Slices

- global_gate: lint

### S1 — Bloqueo + capabilities.untrustedWorkspaces.supported=false

- **Status**: done
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/package.json`, `extensions/vscode/src/commands/start-server-untrusted.ts`, `extensions/vscode/src/test/contributes-completeness.spec.ts`
- **Gate**: type
- review-state: in_review
- review-implementer: copilot-minimax-m3
- implementation:
  - `extensions/vscode/package.json` declares `capabilities.untrustedWorkspaces.supported: false` and adds the `mcp-vertex.startServerUntrusted` contributes.commands entry.
  - `extensions/vscode/src/extension.ts` extends `IVscodeApi.workspace` with `isTrusted` and `IActivationDeps` with `trustOverride`. `activate()` checks `vscode.workspace.isTrusted` (with `trustOverride` bypass) before calling `createDefaultClient`; on `!isTrusted` it shows an informational message, registers the manual command, and returns early.
  - `extensions/vscode/src/commands/start-server-untrusted.ts` re-runs the standard client creation with the trust override.
  - `extensions/vscode/src/test/contributes-completeness.spec.ts` ratchet bumped 32 → 33.
- acceptance:
  - "Comprobación `vscode.workspace.isTrusted` antes de `createDefaultClient`"
  - "Declaración `capabilities.untrustedWorkspaces.supported: false` en `package.json`"
  - "Si `!isTrusted` → mensaje informativo + comando manual `MCP-Vertex: Start Server (Untrusted)` que reproduce el flujo"

### S2 — Aprobación humana con huella (command+args+cwd) persistida e invalidable

- **Status**: done
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/commands/types.ts`, `extensions/vscode/src/test/trust-gate.spec.ts`
- **Gate**: type
- acceptance:
  - "Mostrar QuickPick con comando+args+cwd+resumen legible"
  - "Huella SHA-256 de `(command|args|cwd)` almacenada en `globalState` bajo `mcp-vertex.trust.fingerprint`"
  - "Invalidación al cambiar el contenido del `.mcp.json` (comparación de contenido o timestamp) o al cambiar la huella"

### S3 — Tests de integración (trusted, untrusted, modificado, cancelado)

- **Status**: done
- **Files**: `extensions/vscode/src/test/trust-gate-integration.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Test 1: `isTrusted=false` → `createClient` NO invocado (mock spy)"
  - "Test 2: `isTrusted=true` + huella coincidente → arranca"
  - "Test 3: cambio en `.mcp.json` → huella anterior invalidada, reaprobación obligatoria"
  - "Test 4: cancelación del diálogo → no spawn"

## acceptance

- `extensions/vscode/package.json` declara `capabilities.untrustedWorkspaces.supported: false`.
- `activate()` no llama `createDefaultClient` cuando `!isTrusted`.
- QuickPick se muestra una vez por huella; persiste la aprobación.
- Tests cubren los 4 escenarios.
- `bun run validate` verde.

## notes

- El path crítico a tocar es `extensions/vscode/src/extension.ts` alrededor de
  las líneas 208–245 (activate) y 666–675 (`createDefaultClient`).
- Cita textual del bug (a00070): "Un repositorio malicioso puede incluir ambos
  archivos y provocar la ejecución de un binario o script cuando el usuario lo
  abre en VS Code."
- Worktree de desarrollo: `agent/copilot-audit-fixes` (branch desde
  `develop@89d9a490`).

### next actions

1. Reclamar S1 y bloquear cualquier spawn sin trust.
2. Reclamar S2 e integrar `globalState` con invalidación por fingerprint.
3. Reclamar S3 y escribir los 4 tests de integración.
4. Coordinar con el plugin `security` para añadir un scanner que detecte
   `mcp-vertex.config.json` + `.mcp.json` malformados en el árbol.
