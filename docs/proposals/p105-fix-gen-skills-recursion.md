---
id: p105
type: proposal
status: idea
track: web
date: 2026-06-19
related:
  - p100 # website i18n & docs rewrite (lives next to this in the web track)
  - p101 # web header transitions
---

# p105 — Fix `gen-skills.ts` recursión (SKILL.md en subdirectorios no se descubren)

> **Estado: IDEA para decidir. NO IMPLEMENTAR TODAVÍA.** Recoge un
> bug que bloquea `bun run site:strict` y deja la página `/skills`
> vacía. Cambia ~15 líneas en `apps/web/scripts/gen-skills.ts` + un
> test nuevo. Cuando se apruebe, se abre el primer slice.

## 0. El bug (en una sola ejecución)

`apps/web/scripts/gen-skills.ts:walkSkills` está implementado como
**una sola capa de `readdir`** y solo procesa entradas que son
**archivos `SKILL.md` directamente bajo `skills/`**:

````typescript
for (const entry of readdirSync(dir)) {
  const full = join(dir, entry);
  const st = statSync(full);
  if (st.isFile() && entry === 'SKILL.md') { /* … */ }
}
````

Pero los skills reales del repo viven en subdirectorios:

````text
skills/
  mcp-vertex-plugin-authoring/SKILL.md
  mcp-vertex-failure-modes/SKILL.md
````

Resultado:

- `walkSkills('skills/')` → `[]`.
- `gen-skills --strict` (parte de `bun run site:strict`) falla con
  `✖ gen-skills (strict): no SKILL.md files found under skills/`,
  `process.exit(1)`.
- `apps/web/src/data/skills.json` queda con `skills: []`.
- La página `/skills` se renderiza vacía.

Esto se ve en la sesión de hoy (2026-06-19): el primer intento de
`bun run build:strict` falló por esto, y solo el `bun run build`
(NO strict) pasó, escribiendo un `skills.json` vacío.

## 1. La contradicción interna (que confirma que es un bug)

`slugFromPath` (líneas 30-33) ya está **escrito esperando el
formato `skills/<plugin>/SKILL.md`**:

````typescript
const slugFromPath = (relPath: string): string => {
  const segs = relPath.split('/');
  // expected shape: skills/<plugin>/SKILL.md
  if (segs[0] === 'skills' && segs.length >= 3) return segs[1] as string;
  return segs[0] as string;
};
````

El comentario dice "expected shape: `skills/<plugin>/SKILL.md`" — y
el repo **produce exactamente esa forma**. Pero `walkSkills` pasa
un `rel = `skills/${entry}`` donde `entry` es el nombre del
**archivo** (porque solo entra a la rama `st.isFile()`), no del
directorio. O sea: el resto del pipeline sabe que el formato es
anidado; solo el walker se quedó a medio camino.

## 2. Por qué importa

1. **Bloquea `bun run site:strict`** — el guardián de cobertura
   que la propuesta p100 instauró para "la web nunca miente sobre
   lo que el código expone".
2. **Pérdida silenciosa de información** — los dos SKILL.md ya
   escritos (`mcp-vertex-plugin-authoring`, `mcp-vertex-failure-modes`)
   no aparecen en el sitio, así que un visitante que llegue a
   `https://cartagogit.github.io/mcp-vertex/skills` (cuando esté
   publicado) no ve la oferta real.
3. **Mala señal para nuevos autores** — si alguien añade un tercer
   `skills/<nombre>/SKILL.md` pensando que así aparecerá, no
   aparecerá, y no hay error que le avise (solo `console.warn` en
   modo no-strict).

## 3. El fix (mínimo, sin dependencias, sin tocar API)

Reemplazar el `walkSkills` por una variante recursiva. La forma
más cercana al código actual:

````typescript
const walkSkills = (dir: string): ISkill[] => {
  if (!existsSync(dir)) return [];
  const out: ISkill[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Recurse into plugin/ subdirs (skills/<plugin>/SKILL.md).
      out.push(...walkSkills(full));
      continue;
    }
    if (st.isFile() && entry === 'SKILL.md') {
      const text = readFileSync(full, 'utf8');
      const fm = parseFrontmatter(text);
      // full = <ROOT>/skills/<plugin>/SKILL.md
      const rel = full.slice(ROOT.length + 1); // strip ROOT + '/'
      out.push({
        id: fm.id ?? slugFromPath(rel),
        name: fm.name ?? entry,
        description: fm.description ?? '',
        plugin: slugFromPath(rel),
        summary: firstSentence(
          text.split(/^---\n[\s\S]*?\n---\n/)[1] ?? '',
        ),
        path: rel,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};
````

Cambios:

- Sustituir el bucle plano por uno que **recursa** sobre
  subdirectorios.
- Construir el `rel` desde la ruta absoluta (`full`), no desde
  `skills/${entry}`, para que `slugFromPath` (que espera
  `skills/<plugin>/SKILL.md`) reciba la forma correcta.
- Mantener el resto del pipeline (`parseFrontmatter`,
  `firstSentence`, `slugFromPath`, `main`) **idéntico** — el
  contrato no cambia.

Por qué este fix y no otro:

- **Cero deps nuevas** — solo `readdirSync` / `statSync` que ya
  están importados.
- **No toca la firma pública** de nada: `gen-skills.ts` no
  expone funciones a otros módulos (es un script CLI).
- **Conserva el comportamiento de no-recursar en niveles
  arbitrarios**: el guard `entry === 'SKILL.md'` solo se cumple
  para el archivo llamado exactamente así; las subcarpetas
  anidadas más profundo se siguen visitando (porque `walkSkills`
  recursa), pero el `parseFrontmatter` solo se aplica al
  `SKILL.md` de cada nivel — comportamiento esperado y útil para
  futuros skills anidados.

## 4. Tests

`apps/web/scripts/` no tiene spec por convención (son scripts
de generación, no runtime), pero este bug es exactamente del
tipo que un test barato cazaría. Propongo:

- Crear `apps/web/scripts/__tests__/gen-skills.spec.ts` con dos
  casos:
  1. `walkSkills` vacío cuando el dir no existe.
  2. `walkSkills` sobre un tmpdir con
     `skills/<plugin>/SKILL.md` recupera N entradas con
     `path: 'skills/<plugin>/SKILL.md'` y `plugin: '<plugin>'`.
- Si romper la convención "scripts sin test" es demasiado,
  alternativa mínima: un test de **smoke** en
  `apps/web/tests/gen-skills.smoke.spec.ts` que ejecute
  `gen-capabilities` + `gen-skills` en un tmpdir y verifique que
  el `skills.json` no queda vacío.

Recomiendo la primera (más barata, más directa).

## 5. Slices (siguiendo el patrón disjoint)

- `s1-fix-and-test`:
  - `apps/web/scripts/gen-skills.ts` (modificar `walkSkills`).
  - `apps/web/scripts/__tests__/gen-skills.spec.ts` (nuevo).
  - `apps/web/src/data/skills.json` (regenerado por el script).
  - **gate**: `lint` (lint + el nuevo test verde + `bun run site`
    sin warnings).

Aceptación:

- `walkSkills` ahora entra en subdirectorios.
- El nuevo test pasa (2 casos).
- `apps/web/src/data/skills.json` contiene los 2 SKILL.md
  existentes tras correr `bun run gen:skills`.
- `bun run build:strict` ya no falla por este motivo.
- `bun run site:strict` queda a un solo error de distancia (o
  verde) — si quedan otros, se documentan aquí y se decide
  después.

## 6. Compatibilidad y riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el formato de `path` (era `skills/SKILL.md` plano) | `slugFromPath` ya esperaba `skills/<plugin>/SKILL.md`; el nuevo `rel` coincide con ese contrato. Si algún consumidor downstream lee `path` directamente y rompe, se documenta aquí. |
| Aparecer SKILL.md "huérfanos" en subdirs no intencionados | La estructura del repo (`skills/<plugin>/SKILL.md`) es la única fuente de verdad; cualquier futuro SKILL.md se espera que siga ese patrón. Un check de linter o un README en `skills/` lo deja explícito. |
| Recursión infinita si hay symlinks | `readdirSync` no sigue symlinks por defecto en `node:fs`; no se introduce la recursión a través de bucles. Si en el futuro se quisiera ser defensivo, `lstatSync` + `entry.isSymbolicLink()` y `continue`. |

## 7. Definition of done

- [ ] `walkSkills` recursa.
- [ ] Test nuevo (2 casos) verde.
- [ ] `apps/web/src/data/skills.json` regenerado y contiene los 2
      SKILL.md con `path: "skills/mcp-vertex-…/SKILL.md"`.
- [ ] `bun run site:strict` ya no falla por este motivo.
- [ ] `bun run validate` sigue verde (typecheck + lint + lint:scss
      + tests).
- [ ] Conventional commit:
      `fix(web): gen-skills recurses into subdirs so SKILL.md are found`.

## 8. Decisión (marca lo que quieras)

- [ ] Aprobar el fix mínimo (recursión + 1 test).
- [ ] Mantener el comportamiento de "no recursar más de 1 nivel" si
      en el futuro quieres aplanar.
- [ ] Aceptar el smoke test alternativo si no se quiere meter un
      spec en `apps/web/scripts/`.
- [ ] ¿Renombrar `walkSkills` → `walkSkillsTree` para que el
      nombre refleje el comportamiento recursivo? Recomendado.