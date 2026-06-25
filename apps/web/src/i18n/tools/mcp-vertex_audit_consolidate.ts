// i18n catalogue for the `audit_consolidate` tool.
//
// Catalogue entry for the audit plugin's consolidator
// (apps/web/src/i18n/tools/<key>.ts convention — the path matches the
// `descriptionKey` the tool's registration declares).
//
// 12-lang invariant is enforced by `check-i18n.ts` (l100 s3-bis).
// The English copy is the canonical source of truth; the rest are
// straight translations to keep this plugin self-contained for the
// docs site. Keep the text aligned with
// `plugins/audit/src/lib/tools/consolidate-tool.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const auditConsolidateI18n: IToolI18n = {
	description: {
		en: 'Read every `*.md` in the audits directory (default `docs/mcp-vertex/proposals/done/audits`), parse + deduplicate findings across N models, average per-dimension scores, and return both the structured consolidation and the rendered master markdown. Pure read; no writes, no secrets.',
		es: 'Lee cada `*.md` del directorio de auditorías (por defecto `docs/mcp-vertex/proposals/done/audits`), parsea + deduplica los hallazgos entre N modelos, promedia las puntuaciones por dimensión y devuelve la consolidación estructurada y el maestro en markdown. Solo lectura; sin escrituras, sin secretos.',
		fr: "Lit chaque `*.md` du répertoire d'audits (par défaut `docs/mcp-vertex/proposals/done/audits`), analyse + déduplique les découvertes entre N modèles, moyenne les scores par dimension et renvoie la consolidation structurée et le maître en markdown. Lecture seule; pas d'écritures, pas de secrets.",
		de: 'Liest jede `*.md` im Audit-Verzeichnis (Standard `docs/mcp-vertex/proposals/done/audits`), parst + dedupliziert Findings über N Modelle, mittelt die Werte pro Dimension und gibt sowohl die strukturierte Konsolidierung als auch das gerenderte Master-Markdown zurück. Nur Lesen; keine Schreibvorgänge, keine Geheimnisse.',
		it: 'Legge ogni `*.md` nella directory delle audit (predefinito `docs/mcp-vertex/proposals/done/audits`), analizza + deduplica i risultati tra N modelli, calcola la media dei punteggi per dimensione e restituisce sia il consuntivo strutturato sia il master in markdown. Solo lettura; niente scritture, niente segreti.',
		pt: 'Lê cada `*.md` no diretório de auditorias (padrão `docs/mcp-vertex/proposals/done/audits`), faz parse + deduplica os achados entre N modelos, calcula a média das pontuações por dimensão e devolve a consolidação estruturada e o mestre em markdown. Só leitura; sem escritas, sem segredos.',
		ja: '監査ディレクトリ (デフォルト `docs/mcp-vertex/proposals/done/audits`) のすべての `*.md` を読み込み、N モデル間で発見を解析+重複排除し、ディメンションごとのスコアを平均して、構造化された統合結果とレンダリングされたマスター markdown の両方を返します。読み取り専用、書き込みなし、シークレットなし。',
		zh: '读取审计目录 (默认 `docs/mcp-vertex/proposals/done/audits`) 中的每个 `*.md`,解析+去重 N 个模型的发现,按维度平均分数,并返回结构化的整合结果和渲染后的主控 markdown。仅读取,无写入,无秘密。',
		hi: 'ऑडिट निर्देशिका (डिफ़ॉल्ट `docs/mcp-vertex/proposals/done/audits`) में प्रत्येक `*.md` पढ़ता है, N मॉडल में खोजों को पार्स + डी-डुप्लिकेट करता है, प्रति-डाइमेंशन स्कोर का औसत निकालता है, और संरचित समेकन तथा रेंडर किए गए मास्टर markdown दोनों लौटाता है। केवल पढ़ने के लिए; कोई लिखावट नहीं, कोई रहस्य नहीं।',
		ar: 'يقرأ كل `*.md` في دليل التدقيق (الافتراضي `docs/mcp-vertex/proposals/done/audits`)، ويحلل ويزيل التكرار من النتائج عبر نماذج N، ويحسب متوسط الدرجات لكل بُعد، ويُرجع كلاً من التوحيد المنظم والـ markdown الرئيسي المعروض. قراءة فقط؛ لا كتابات، لا أسرار.',
		th: 'อ่านทุก `*.md` ในไดเรกทอรีการตรวจสอบ (ค่าเริ่มต้น `docs/mcp-vertex/proposals/done/audits`) แยกวิเคราะห์ + ลบรายการซ้ำในข้อค้นพบข้าม N โมเดล คำนวณค่าเฉลี่ยคะแนนต่อมิติ และส่งคืนทั้งการรวมผลที่มีโครงสร้างและ markdown หลักที่เรนเดอร์แล้ว อ่านอย่างเดียว ไม่มีการเขียน ไม่มีความลับ',
		vi: 'Đọc mọi `*.md` trong thư mục audit (mặc định `docs/mcp-vertex/proposals/done/audits`), phân tích + loại bỏ trùng lặp các phát hiện qua N mô hình, tính trung bình điểm theo chiều và trả về cả hợp nhất có cấu trúc và markdown chính đã render. Chỉ đọc; không ghi, không bí mật.',
	},
};
