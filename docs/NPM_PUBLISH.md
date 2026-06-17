# Publicar `@cartago-git/mcp-*` en npm — guía paso a paso

> Todo queda **preparado** para que solo ejecutes estos pasos con tu cuenta.
> Paquetes (10): `@cartago-git/mcp-core`, `@cartago-git/mcp-proposals`,
> `@cartago-git/mcp-rules`, `@cartago-git/mcp-memory`, `@cartago-git/mcp-git`,
> `@cartago-git/mcp-quality`, `@cartago-git/mcp-search`,
> `@cartago-git/mcp-notification`, `@cartago-git/mcp-docs`, `@cartago-git/mcp-deps`. Todos en `0.1.0`,
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

## 0.0 Vía CI (lo más automático): push a `main`

Con los workflows `release.yml` y `pages.yml` el ciclo es automático:

1. Bump de versión: `bun run release --bump=patch --write` (versiona los 10
   paquetes en lockstep) y commitea.
2. Push a `main`. El workflow **Release** detecta que la `version` de
   `packages/core/package.json` no tiene aún tag `vX.Y.Z` →
   valida + build + `bun run release --publish` (publica los 10 en orden) +
   crea el **tag** + un **GitHub Release** con notas autogeneradas.
3. El workflow **Pages** regenera y despliega el sitio (web de la doc) desde la
   lista viva de tools (modo `--strict`: si una tool no tiene descripción, falla).

**Setup único (una vez):**
- Secreto `NPM_TOKEN` (npm *automation token*) en *Settings → Secrets → Actions*.
- *Settings → Pages → Source = "GitHub Actions"*.
- npm 2FA: usa un *automation token* (no pide OTP interactivo en CI).

Si no hay bump de versión, el push a `main` NO publica (idempotente: el tag ya
existe). Lo de abajo (§0/§1/§2) es la vía manual equivalente.

## 0. Vía manual asistida: `bun run release`
Un único comando versiona los 10 paquetes **en lockstep** (todos a la misma
versión, reescribiendo el `peerDependency` `^x.y.z` del core en los 9 plugins) y
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

## 1. Validar antes de publicar (desde la raíz del repo `/_projects/mcp-core`)
```bash
bun install
bun run validate            # typecheck + tests (debe acabar en verde)
```

## 2. Orden de publicación (IMPORTANTE)
`mcp-core` PRIMERO (los plugins lo declaran como `peerDependency`). Luego los 9
plugins en cualquier orden.

```bash
# 1) núcleo
cd packages/core        && npm publish && cd -
# 2) plugins
cd plugins/proposals    && npm publish && cd -
cd plugins/rules        && npm publish && cd -
cd plugins/memory       && npm publish && cd -
cd plugins/git          && npm publish && cd -
cd plugins/quality      && npm publish && cd -
cd plugins/search       && npm publish && cd -
cd plugins/notification && npm publish && cd -
cd plugins/docs         && npm publish && cd -
cd plugins/deps         && npm publish && cd -
```
- `publishConfig.access=public` ya está, así que NO necesitas `--access public`.
- Si usas 2FA te pedirá el OTP en cada uno (`npm publish --otp=123456`).

### Nota sobre el protocolo `workspace:*`
Los plugins tienen `"@cartago-git/mcp-core": "workspace:*"` en **devDependencies**.
- Con **`bun publish`** se reescribe automáticamente a la versión real → usa
  `bun publish` en lugar de `npm publish` si te da error el protocolo:
  ```bash
  cd packages/core && bun publish && cd -
  cd plugins/proposals && bun publish && cd -    # ...y el resto igual
  ```
- Con `npm publish`, si se queja del `workspace:` en devDependencies, cámbialo a
  `"@cartago-git/mcp-core": "^0.1.0"` en los 5 plugins antes de publicar (es solo
  devDependency, no afecta a los consumidores).

## 3. Verificar lo publicado
```bash
npm view @cartago-git/mcp-core version
bunx @cartago-git/mcp-core --plugins=proposals,rules,memory,git,quality,search,notification,docs,deps --check
# Debe imprimir "ok": true y "assembles": true
```

## 4. Post-publicación: que Affairs use lo publicado (en vez del path local)
Hoy Affairs consume mcp-core por **rutas locales** (tsconfig paths + alias de
vitest apuntando a `../../../mcp-core/...`). Cuando publiques:
1. En `affairs/libs/mcp-server/package.json` añade dependencias reales:
   ```jsonc
   "@cartago-git/mcp-core": "^0.1.0",
   "@cartago-git/mcp-proposals": "^0.1.0"
   ```
2. Quita los `paths` `@cartago-git/*` de `affairs/tsconfig.base.json` y los alias
   `@cartago-git/*` de `affairs/libs/mcp-server/vitest.config.ts` (para que
   resuelvan desde `node_modules`).
3. `bun install` en affairs y `bun run --cwd libs/mcp-server test` (1184 verdes).
   - Ojo: los paquetes publican **fuente TS**; vitest/bun la transpilan. Si algún
     consumidor Node puro fallara, habría que añadir un build a `dist` (ver §6).

## 5. Versionado siguiente
- Sube versión con `npm version patch|minor` en cada paquete que cambie (o usa
  changesets si quieres automatizarlo). Mantén `mcp-core` y plugins compatibles
  por `peerDependency` (`^0.x`).

## 6. (Opcional, futuro) build a `dist` para consumidores Node puro
Hoy se publica TS (bun-native, como `@cartago-git/keyer`). Si quieres soportar
Node sin transpilación: añadir `tsc` build por paquete, `exports` apuntando a
`dist/*.js` + `dist/*.d.ts`, y `files: ["dist"]`. No es necesario para uso con
Bun ni vía `bunx`.

---
*Resumen: `bun install && bun run validate` → publicar core → publicar los 5
plugins → `bunx ... --check` para verificar. Nada más.*
