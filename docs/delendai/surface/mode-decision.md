# Surface mode policy

El modo efectivo se mantiene estable durante la sesión y no depende de que el
cliente anuncie ni atienda `notifications/tools/list_changed`.

Reglas actuales:

- Sin override explícito, el modo es `managed`.
- `managed` publica únicamente la superficie bootstrap y enruta el resto
  internamente mediante `vertex`.
- `native`, `adaptive` y `compact` se mantienen como overrides explícitos para
  compatibilidad, medición o hosts que necesiten otra superficie.

Overrides explícitos:

- CLI: `--surface=managed|native|adaptive|compact` tiene precedencia máxima.
- Config: delendai.config.json.surfaceMode aplica cuando la CLI no fijó el modo.

Las capabilities del cliente se conservan en la API de decisión por
compatibilidad, pero no cambian silenciosamente el modo efectivo.
