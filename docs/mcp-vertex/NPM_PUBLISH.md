# Publicar `@mcp-vertex/*` en npm — guía paso a paso

> Todo queda **preparado** para que solo ejecutes estos pasos con tu cuenta.
> Paquetes publicables (17): `@mcp-vertex/core`, `@mcp-vertex/client`,
> `@mcp-vertex/cli`, `@mcp-vertex/proposals`, `@mcp-vertex/rules`,
> `@mcp-vertex/memory`, `@mcp-vertex/git`, `@mcp-vertex/quality`,
> `@mcp-vertex/search`, `@mcp-vertex/notification`, `@mcp-vertex/docs`,
> `@mcp-vertex/deps`, `@mcp-vertex/audit`, `@mcp-vertex/logs`,
> `@mcp-vertex/status-marker`, `@mcp-vertex/test-convention` y
> `@mcp-vertex/web-fetch`. Todos en `0.1.0`,
> `publishConfig.access=public`, `files` limitado a `src` + README + LICENSE.

## 0. Requisitos (una vez)
1. Cuenta npm con acceso a la org **`@cartago-git`** (créala en npmjs.com →
   *Add Organization* → `cartago-git`, gratis para paquetes públicos).
2. Login en la terminal:
   ```bash
   npm login            # o: bun pm whoami  /  npm whoami  para verificar
   ```
3. (Recomendado) 2FA en modo "Authorization and Publishing" → tendrás que meter
   el OTP en cada publish, o crea un *Automation token* para CI.

## 0.0 Vía CI (el usuario no hace nada): push a `main`

Con los workflows `release.yml` y `pages.yml` el ciclo es **totalmente automático
y dirigido por los commits** — no hay que bumpear versiones a mano:

1. Haz merge/push a `main` con commits **Conventional Commits**
   (`feat:`/`fix:`/`perf:`/`feat!:`…).
2. El workflow **Release** ejecuta `scripts/derive-version.ts`, que lee los commits
   desde el último tag `vX.Y.Z` y decide el salto: `feat`→minor, `fix`/`perf`→patch,
   `!`/`BREAKING CHANGE`→major. Solo `docs`/`chore`/`ci`/`test`/`style`/`build`/
   `refactor` → **no publica**. Un commit no convencional con contenido → patch
   (default seguro). Si hay algo que publicar: valida + build +
   `bun run release --set=<versión derivada> --write --publish` (17 paquetes en
   orden) + crea el **tag** `vX.Y.Z` + un **GitHub Release** con notas autogeneradas.
   *Tag-driven:* el bump NO se commitea de vuelta a `main` (sin bucles de CI).
3. El workflow **Pages** regenera y despliega el sitio (web de la doc) desde la
   lista viva de tools (modo `--strict`: si una tool no tiene descripción, falla).

**Setup único (una vez):**
- Secreto `NPM_TOKEN` (npm *Granular access token* con **Bypass 2FA** activado) en
  *Settings → Secrets → Actions*. Desde **noviembre 2025** los tokens de
  escritura caducan a los 90 días como máximo legal; el workflow
  [`.github/workflows/rotate-npm-token.yml`](../.github/workflows/rotate-npm-token.yml)
  abre un issue recordatorio cada ~3 meses (ver §0.1).
- *Settings → Pages → Source = "GitHub Actions"*.

Si los commits desde el último tag son todos no-releasables (`docs`/`chore`/…),
el push a `main` NO publica. Lo de abajo (§0/§1/§2) es la vía manual equivalente
(`bun run release --bump=… --write --publish`), por si quieres forzar una release.

### 0.1 Granular token con Bypass 2FA (lo que se usa hoy)
npm retiró los *Legacy* y *Automation* tokens en noviembre 2025. El único tipo
de token es **Granular**, y se configura así:
- Name: `mcp-vertex-release-ci`
- Packages/Scopes: `@cartago-git`
- Permissions: *Read and write*
- Organizations: *No access*
- Expiration: 90 días (máximo legal)
- **Bypass 2FA**: ✅ activado ← clave para que CI no pida OTP

### 0.2 Rotación trimestral automática
El workflow [`rotate-npm-token.yml`](../.github/workflows/rotate-npm-token.yml)
corre el día 1 de cada 3 meses (`cron: "0 9 1 */3 *"`). Si han pasado más de
75 días desde el último recordatorio, abre un issue con la etiqueta
`npm-token-rotation` y los pasos exactos para regenerar el token. También puede
lanzarse manualmente desde la pestaña *Actions*.

## 0. Vía manual asistida: `bun run release`
Un único comando versiona los 17 paquetes publicables **en lockstep** (todos a la misma
versión, reescribiendo las dependencias workspace internas a la versión real) y
publica en el orden correcto. Por defecto es **dry-run** (no escribe nada):

```bash
bun run release                       # muestra versiones actuales + plan de publicación
bun run release --bump=patch          # planifica un bump lockstep (dry-run)
bun run release --bump=minor --write  # aplica el bump a cada package.json
bun run release --set=0.2.0 --write   # fija una versión lockstep explícita
bun run release --publish             # valida (bun run validate) + publica en orden
bun run release --bump=patch --write --publish   # release completo de una pasada
```
Flags: `--bump=patch|minor|major` · `--set=X.Y.Z` (excluyentes) · `--write`
(aplica; por defecto dry-run) · `--publish` · `--no-validate` · `--tool=bun|npm`
(por defecto `bun`, que reescribe `workspace:*`). El 2FA/OTP de npm se introduce
de forma interactiva en cada paquete (stdio heredado).

Los pasos manuales de abajo (§1–§2) siguen siendo válidos como referencia o si
prefieres controlar cada publish a mano.

## 1. Validar antes de publicar (desde la raíz del repo `/_projects/mcp-vertex`)
```bash
bun install
bun run validate            # typecheck + tests (debe acabar en verde)
```

## 2. Orden de publicación (IMPORTANTE)
`@mcp-vertex/core` PRIMERO; después `@mcp-vertex/client` y `@mcp-vertex/cli`;
finalmente los plugins en cualquier orden compatible con sus dependencias.

```bash
# 1) núcleo
cd packages/core        && npm publish && cd -
# 2) cliente + CLI
cd packages/client      && npm publish && cd -
cd packages/cli         && npm publish && cd -
# 3) plugins
cd plugins/audit        && npm publish && cd -
cd plugins/proposals    && npm publish && cd -
cd plugins/rules        && npm publish && cd -
cd plugins/memory       && npm publish && cd -
cd plugins/git          && npm publish && cd -
cd plugins/quality      && npm publish && cd -
cd plugins/search       && npm publish && cd -
cd plugins/notification && npm publish && cd -
cd plugins/docs         && npm publish && cd -
cd plugins/deps         && npm publish && cd -
cd plugins/logs         && npm publish && cd -
cd plugins/status-marker && npm publish && cd -
cd plugins/test-convention && npm publish && cd -
cd plugins/web-fetch    && npm publish && cd -
```
- `publishConfig.access=public` ya está, así que NO necesitas `--access public`.
- Si usas 2FA te pedirá el OTP en cada uno (`npm publish --otp=123456`).

### Nota sobre el protocolo `workspace:*`
Los plugins tienen `"@mcp-vertex/core": "workspace:*"` en **devDependencies**.
- Con **`bun publish`** se reescribe automáticamente a la versión real → usa
  `bun publish` en lugar de `npm publish` si te da error el protocolo:
  ```bash
  cd packages/core && bun publish && cd -
  cd plugins/proposals && bun publish && cd -    # ...y el resto igual
  ```
- Con `npm publish`, si se queja del `workspace:` en devDependencies, cámbialo a
  `"@mcp-vertex/core": "^0.1.0"` en los 5 plugins antes de publicar (es solo
  devDependency, no afecta a los consumidores).

## 3. Verificar lo publicado
```bash
npm view @mcp-vertex/core version
bunx @mcp-vertex/cli --version
bunx @mcp-vertex/cli overview --json
bunx @mcp-vertex/core --plugins=proposals,rules,memory,git,quality,search,notification,docs,deps --check
# Debe imprimir "ok": true y "assembles": true
```

## 4. Post-publicación: migrar un consumidor de path local a paquete publicado
Cualquier consumidor que estuviera enlazando `mcp-vertex` por **rutas locales**
(tsconfig paths + alias de vitest apuntando a `../../../mcp-vertex/...`)
debe pasarse a la dependencia real cuando publiques:
1. En el `package.json` del consumidor añade dependencias reales:
   ```jsonc
   "@mcp-vertex/core": "^0.1.0",
   "@mcp-vertex/proposals": "^0.1.0"
   ```
2. Quita los `paths` `@mcp-vertex/*` del `tsconfig.base.json` del consumidor y
   los alias `@mcp-vertex/*` de su `vitest.config.ts` (para que resuelvan desde
   `node_modules`).
3. `bun install` en el consumidor y su `bun test` (todos verdes).
   - Ojo: los paquetes publican **fuente TS**; vitest/bun la transpilan. Si algún
     consumidor Node puro fallara, habría que añadir un build a `dist` (ver §6).

## 5. Versionado siguiente
- Sube versión con `npm version patch|minor` en cada paquete que cambie (o usa
  changesets si quieres automatizarlo). Mantén `mcp-vertex` y plugins compatibles
  por `peerDependency` (`^0.x`).

## 6. (Opcional, futuro) build a `dist` para consumidores Node puro
Hoy se publica TS (bun-native, como `@mcp-vertex/keyer`). Si quieres soportar
Node sin transpilación: añadir `tsc` build por paquete, `exports` apuntando a
`dist/*.js` + `dist/*.d.ts`, y `files: ["dist"]`. No es necesario para uso con
Bun ni vía `bunx`.

---
*Resumen: `bun install && bun run validate` → publicar core → publicar client/cli
→ publicar plugins → `bunx @mcp-vertex/cli overview --json` para verificar. Nada más.*
