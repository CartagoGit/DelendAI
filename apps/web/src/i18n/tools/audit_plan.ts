// i18n catalogue for the `audit_plan` tool.
//
// Catalogue entry for the audit plugin's brief generator
// (apps/web/src/i18n/tools/<key>.ts convention — the path matches the
// `descriptionKey` the tool's registration declares).
//
// 12-lang invariant is enforced by `check-i18n.ts` (l100 s3-bis).
// The English copy is the canonical source of truth; the rest are
// straight translations to keep this plugin self-contained for the
// docs site. Keep the text aligned with `plugins/audit/src/lib/brief.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const auditPlanI18n: IToolI18n = {
	description: {
		en: 'Return the canonical audit brief (markdown). Paste it into any model session to elicit an audit `@mcp-vertex/audit` can consolidate. Universal scopes: `full` (default), `security`, `tokens`, `tests`, `docs`. Additional layer scopes (e.g. `core`, `api`, `frontend`) are configured via `options.layers` in `mcp-vertex.config.json`. No I/O, no secrets.',
		es: 'Devuelve el brief canónico de auditoría (markdown). Pégalo en cualquier sesión de modelo para elicitar una auditoría que `@mcp-vertex/audit` puede consolidar. Scopes universales: `full` (por defecto), `security`, `tokens`, `tests`, `docs`. Scopes de capa adicionales (p.ej. `core`, `api`, `frontend`) se configuran en `options.layers` de `mcp-vertex.config.json`. Sin E/S, sin secretos.',
		fr: "Renvoie le brief d'audit canonique (markdown). Collez-le dans n'importe quelle session de modèle pour obtenir un audit que `@mcp-vertex/audit` peut consolider. Scopes universels: `full` (par défaut), `security`, `tokens`, `tests`, `docs`. Les scopes de couche supplémentaires (ex. `core`, `api`, `frontend`) sont configurés via `options.layers` dans `mcp-vertex.config.json`. Pas d'E/S, pas de secrets.",
		de: 'Gibt das kanonische Audit-Brief (Markdown) zurück. Füge es in eine beliebige Modell-Session ein, um ein Audit zu erhalten, das `@mcp-vertex/audit` konsolidieren kann. Universelle Scopes: `full` (Standard), `security`, `tokens`, `tests`, `docs`. Zusätzliche Layer-Scopes (z.B. `core`, `api`, `frontend`) werden über `options.layers` in `mcp-vertex.config.json` konfiguriert. Kein I/O, keine Geheimnisse.',
		it: 'Restituisce il brief canonico di audit (markdown). Incollalo in qualsiasi sessione di modello per elicitare un audit che `@mcp-vertex/audit` può consolidare. Scope universali: `full` (predefinito), `security`, `tokens`, `tests`, `docs`. Scope di layer aggiuntivi (es. `core`, `api`, `frontend`) si configurano tramite `options.layers` in `mcp-vertex.config.json`. Nessun I/O, nessun segreto.',
		pt: 'Devolve o brief canónico de auditoria (markdown). Cole-o em qualquer sessão de modelo para eliciar uma auditoria que `@mcp-vertex/audit` consegue consolidar. Scopes universais: `full` (padrão), `security`, `tokens`, `tests`, `docs`. Scopes de camada adicionais (ex. `core`, `api`, `frontend`) configuram-se via `options.layers` em `mcp-vertex.config.json`. Sem E/S, sem segredos.',
		ja: '正規の監査ブリーフ (markdown) を返します。任意のモデルセッションに貼り付けて、`@mcp-vertex/audit` が統合できる監査を引き出します。ユニバーサルスコープ: `full` (デフォルト)、`security`、`tokens`、`tests`、`docs`。追加レイヤースコープ (例: `core`、`api`、`frontend`) は `mcp-vertex.config.json` の `options.layers` で設定します。I/O なし、シークレットなし。',
		zh: '返回规范的审计简报 (markdown)。将其粘贴到任何模型会话中,以获取 `@mcp-vertex/audit` 可以整合的审计。通用范围: `full` (默认)、`security`、`tokens`、`tests`、`docs`。其他层范围 (例如 `core`、`api`、`frontend`) 通过 `mcp-vertex.config.json` 中的 `options.layers` 配置。无 I/O,无秘密。',
		hi: 'कैनोनिकल ऑडिट ब्रीफ (markdown) लौटाता है। किसी भी मॉडल सत्र में पेस्ट करें ताकि `@mcp-vertex/audit` समेकित कर सके। यूनिवर्सल स्कोप: `full` (डिफ़ॉल्ट), `security`, `tokens`, `tests`, `docs`। अतिरिक्त लेयर स्कोप (जैसे `core`, `api`, `frontend`) को `mcp-vertex.config.json` में `options.layers` से कॉन्फ़िगर किया जाता है। कोई I/O नहीं, कोई सीक्रेट नहीं।',
		ar: 'يرجع الموجز المعياري للتدقيق (markdown). الصقه في أي جلسة نموذج للحصول على تدقيق يمكن لـ `@mcp-vertex/audit` توحيده. النطاقات الشاملة: `full` (الافتراضي)، `security`، `tokens`، `tests`، `docs`. نطاقات الطبقات الإضافية (مثل `core`، `api`، `frontend`) تُهيَّأ عبر `options.layers` في `mcp-vertex.config.json`. لا إدخال/إخراج، لا أسرار.',
		th: 'ส่งคืนบรีฟการตรวจสอบมาตรฐาน (markdown) วางในเซสชันโมเดลใดก็ได้เพื่อรับการตรวจสอบที่ `@mcp-vertex/audit` รวมเข้าด้วยกันได้ สโคปสากล: `full` (ค่าเริ่มต้น), `security`, `tokens`, `tests`, `docs` สโคปเลเยอร์เพิ่มเติม (เช่น `core`, `api`, `frontend`) กำหนดค่าผ่าน `options.layers` ใน `mcp-vertex.config.json` ไม่มี I/O ไม่มีความลับ',
		vi: 'Trả về brief kiểm toán chuẩn (markdown). Dán vào bất kỳ phiên mô hình nào để nhận bản kiểm toán mà `@mcp-vertex/audit` có thể hợp nhất. Phạm vi phổ quát: `full` (mặc định), `security`, `tokens`, `tests`, `docs`. Phạm vi lớp bổ sung (ví dụ `core`, `api`, `frontend`) được cấu hình qua `options.layers` trong `mcp-vertex.config.json`. Không I/O, không bí mật.',
	},
};
