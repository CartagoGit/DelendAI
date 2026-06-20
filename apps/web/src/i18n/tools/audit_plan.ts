// i18n catalogue for the `audit_plan` tool.
//
// Catalogue entry for the audit plugin's brief generator
// (apps/web/src/i18n/tools/<key>.ts convention — the path matches the
// `descriptionKey` the tool's registration declares).
//
// 12-lang invariant is enforced by `check-i18n.ts` (p100 s3-bis).
// The English copy is the canonical source of truth; the rest are
// straight translations to keep this plugin self-contained for the
// docs site. Keep the text aligned with `plugins/audit/src/lib/brief.ts`.

import type { IToolI18n } from './_shape';

export const auditPlanI18n: IToolI18n = {
	description: {
		en: 'Return the canonical audit brief (markdown). Paste it into any model session to elicit an audit in the format `@mcp-vertex/audit` can consolidate. Optional `scope` narrows the focus (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; default `full`). No I/O, no secrets.',
		es: 'Devuelve el brief canónico de auditoría (markdown). Pégalo en cualquier sesión de modelo para elicitar una auditoría en el formato que `@mcp-vertex/audit` puede consolidar. `scope` opcional enfoca la auditoría (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; por defecto `full`). Sin E/S, sin secretos.',
		fr: "Renvoie le brief d'audit canonique (markdown). Collez-le dans n'importe quelle session de modèle pour obtenir un audit dans le format que `@mcp-vertex/audit` peut consolider. `scope` optionnel restreint le focus (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; défaut `full`). Pas d'E/S, pas de secrets.",
		de: 'Gibt das kanonische Audit-Brief (Markdown) zurück. Füge es in eine beliebige Modell-Session ein, um ein Audit im Format zu erhalten, das `@mcp-vertex/audit` konsolidieren kann. Optionales `scope` schränkt den Fokus ein (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; Standard `full`). Kein I/O, keine Geheimnisse.',
		it: 'Restituisce il brief canonico di audit (markdown). Incollalo in qualsiasi sessione di modello per elicitare un audit nel formato che `@mcp-vertex/audit` può consolidare. `scope` opzionale restringe il focus (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; predefinito `full`). Nessun I/O, nessun segreto.',
		pt: 'Devolve o brief canónico de auditoria (markdown). Cole-o em qualquer sessão de modelo para eliciar uma auditoria no formato que `@mcp-vertex/audit` consegue consolidar. `scope` opcional foca a auditoria (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; padrão `full`). Sem E/S, sem segredos.',
		ja: '正規の監査ブリーフ (markdown) を返します。任意のモデルセッションに貼り付けて、`@mcp-vertex/audit` が統合できる形式の監査を引き出します。オプションの `scope` で焦点を絞ります (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; デフォルト `full`)。I/O なし、シークレットなし。',
		zh: '返回规范的审计简报 (markdown)。将其粘贴到任何模型会话中,以获取 `@mcp-vertex/audit` 可以整合的格式的审计。可选的 `scope` 缩小范围(`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`;默认 `full`)。无 I/O,无秘密。',
		hi: 'कैनोनिकल ऑडिट ब्रीफ (markdown) लौटाता है। किसी भी मॉडल सत्र में पेस्ट करें ताकि उस प्रारूप में ऑडिट मिल सके जिसे `@mcp-vertex/audit` समेकित कर सके। वैकल्पिक `scope` फोकस को सीमित करता है (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; डिफ़ॉल्ट `full`)। कोई I/O नहीं, कोई सीक्रेट नहीं।',
		ar: 'يرجع الموجز المعياري للتدقيق (markdown). الصقه في أي جلسة نموذج للحصول على تدقيق بالصيغة التي يمكن لـ `@mcp-vertex/audit` توحيدها. `scope` اختياري يضيق التركيز (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; الافتراضي `full`). لا توجد إدخال/إخراج، لا توجد أسرار.',
		th: 'ส่งคืนบรีฟการตรวจสอบมาตรฐาน (markdown) วางในเซสชันโมเดลใดก็ได้เพื่อรับการตรวจสอบในรูปแบบที่ `@mcp-vertex/audit` รวมเข้าด้วยกันได้ `scope` ทางเลือกจำกัดขอบเขต (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; ค่าเริ่มต้น `full`) ไม่มี I/O ไม่มีความลับ',
		vi: 'Trả về brief kiểm toán chuẩn (markdown). Dán vào bất kỳ phiên mô hình nào để nhận bản kiểm toán ở định dạng mà `@mcp-vertex/audit` có thể hợp nhất. `scope` tùy chọn thu hẹp phạm vi (`full` | `core` | `plugins` | `web` | `security` | `tokens` | `tests` | `docs`; mặc định `full`). Không I/O, không bí mật.',
	},
};
