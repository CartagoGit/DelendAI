# Publicar `@cartago-git/mcp-*` en npm — guía paso a paso

> Todo queda **preparado** para que solo ejecutes estos pasos con tu cuenta.
> Paquetes (8): `@cartago-git/mcp-core`, `@cartago-git/mcp-proposals`,
> `@cartago-git/mcp-rules`, `@cartago-git/mcp-memory`, `@cartago-git/mcp-git`,
> `@cartago-git/mcp-quality`, `@cartago-git/mcp-search`,
> `@cartago-git/mcp-notification`. Todos en `0.1.0`,
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

## 1. Validar antes de publicar (desde la raíz del repo `/_projects/mcp-core`)
```bash
bun install
bun run validate            # typecheck + 360 tests (debe acabar en verde)
```

## 2. Orden de publicación (IMPORTANTE)
`mcp-core` PRIMERO (los plugins lo declaran como `peerDependency`). Luego los 7
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
bunx @cartago-git/mcp-core --plugins=proposals,rules,memory,git,quality,search,notification --check
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
