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
		en: 'Return the canonical audit brief (markdown) for the requested scope and mode. Universal scopes: `full` (default), `security`, `tokens`, `tests`, `docs`. Layer scopes depend on host configuration (`options.layers`). Modes: `general` (whole project, default for `scope: full`), `specific` (one dimension/layer), `monorepo` (filter layers via `projects`). Paste the output into any model session to elicit a structured audit.',
		es: 'Devuelve el brief canónico de auditoría (markdown) para el alcance y el modo pedidos. Alcances universales: `full` (por defecto), `security`, `tokens`, `tests`, `docs`. Los alcances por capa dependen de la configuración del host (`options.layers`). Modos: `general` (todo el proyecto, por defecto con `scope: full`), `specific` (una dimensión o capa), `monorepo` (filtra capas con `projects`). Pega la salida en la sesión de cualquier modelo para obtener una auditoría estructurada.',
		fr: "Renvoie le brief d'audit canonique (markdown) pour la portée et le mode demandés. Portées universelles : `full` (par défaut), `security`, `tokens`, `tests`, `docs`. Les portées par couche dépendent de la configuration de l'hôte (`options.layers`). Modes : `general` (tout le projet, par défaut pour `scope: full`), `specific` (une dimension ou une couche), `monorepo` (filtre les couches via `projects`). Collez la sortie dans la session de n'importe quel modèle pour obtenir un audit structuré.",
		de: 'Liefert das kanonische Audit-Briefing (Markdown) für den angefragten Umfang und Modus. Universelle Umfänge: `full` (Standard), `security`, `tokens`, `tests`, `docs`. Schicht-Umfänge hängen von der Host-Konfiguration ab (`options.layers`). Modi: `general` (ganzes Projekt, Standard für `scope: full`), `specific` (eine Dimension oder Schicht), `monorepo` (Schichten über `projects` filtern). Füge die Ausgabe in die Sitzung eines beliebigen Modells ein, um ein strukturiertes Audit zu erhalten.',
		it: "Restituisce il brief di audit canonico (markdown) per l'ambito e la modalità richiesti. Ambiti universali: `full` (predefinito), `security`, `tokens`, `tests`, `docs`. Gli ambiti per livello dipendono dalla configurazione dell'host (`options.layers`). Modalità: `general` (tutto il progetto, predefinita per `scope: full`), `specific` (una dimensione o un livello), `monorepo` (filtra i livelli con `projects`). Incolla l'output nella sessione di qualsiasi modello per ottenere un audit strutturato.",
		pt: 'Devolve o brief canónico de auditoria (markdown) para o âmbito e o modo pedidos. Âmbitos universais: `full` (por omissão), `security`, `tokens`, `tests`, `docs`. Os âmbitos por camada dependem da configuração do anfitrião (`options.layers`). Modos: `general` (todo o projeto, por omissão com `scope: full`), `specific` (uma dimensão ou camada), `monorepo` (filtra camadas com `projects`). Cole a saída na sessão de qualquer modelo para obter uma auditoria estruturada.',
		ja: '要求された範囲とモードに対する正規の監査ブリーフ(markdown)を返します。共通の範囲:`full`(既定)、`security`、`tokens`、`tests`、`docs`。レイヤーの範囲はホストの設定(`options.layers`)によります。モード:`general`(プロジェクト全体、`scope: full` の既定)、`specific`(1 つの観点またはレイヤー)、`monorepo`(`projects` でレイヤーを絞り込み)。出力を任意のモデルのセッションに貼り付けると、構造化された監査を引き出せます。',
		zh: '返回所请求范围和模式的规范审计简报(markdown)。通用范围:`full`(默认)、`security`、`tokens`、`tests`、`docs`。分层范围取决于宿主配置(`options.layers`)。模式:`general`(整个项目,`scope: full` 时的默认值)、`specific`(单个维度或层)、`monorepo`(通过 `projects` 筛选层)。把输出粘贴到任意模型的会话中,即可获得结构化的审计。',
		hi: 'माँगे गए दायरे और मोड के लिए मानक ऑडिट ब्रीफ़ (markdown) लौटाता है। सार्वभौमिक दायरे: `full` (डिफ़ॉल्ट), `security`, `tokens`, `tests`, `docs`। परत-दायरे होस्ट कॉन्फ़िगरेशन (`options.layers`) पर निर्भर करते हैं। मोड: `general` (पूरा प्रोजेक्ट, `scope: full` का डिफ़ॉल्ट), `specific` (एक आयाम या परत), `monorepo` (`projects` से परतें छाँटें)। संरचित ऑडिट पाने के लिए आउटपुट को किसी भी मॉडल के सत्र में चिपकाएँ।',
		ar: 'يعيد موجز التدقيق القياسي (markdown) للنطاق والنمط المطلوبين. النطاقات العامة: `full` (الافتراضي)، `security`، `tokens`، `tests`، `docs`. تعتمد نطاقات الطبقات على إعدادات المضيف (`options.layers`). الأنماط: `general` (المشروع كله، الافتراضي مع `scope: full`)، و`specific` (بُعد أو طبقة واحدة)، و`monorepo` (تصفية الطبقات عبر `projects`). الصق المخرجات في جلسة أي نموذج لاستخراج تدقيق منظّم.',
		th: 'คืนสรุปการตรวจสอบมาตรฐาน (markdown) สำหรับขอบเขตและโหมดที่ขอ ขอบเขตทั่วไป: `full` (ค่าเริ่มต้น), `security`, `tokens`, `tests`, `docs` ขอบเขตตามชั้นขึ้นกับการตั้งค่าโฮสต์ (`options.layers`) โหมด: `general` (ทั้งโปรเจกต์ เป็นค่าเริ่มต้นเมื่อ `scope: full`), `specific` (มิติหรือชั้นเดียว), `monorepo` (กรองชั้นด้วย `projects`) วางผลลัพธ์ลงในเซสชันของโมเดลใดก็ได้เพื่อให้ได้การตรวจสอบแบบมีโครงสร้าง',
		vi: 'Trả về bản tóm tắt kiểm toán chuẩn (markdown) cho phạm vi và chế độ được yêu cầu. Phạm vi chung: `full` (mặc định), `security`, `tokens`, `tests`, `docs`. Phạm vi theo lớp phụ thuộc vào cấu hình máy chủ (`options.layers`). Chế độ: `general` (toàn dự án, mặc định khi `scope: full`), `specific` (một khía cạnh hoặc lớp), `monorepo` (lọc lớp qua `projects`). Dán đầu ra vào phiên của bất kỳ mô hình nào để có một bản kiểm toán có cấu trúc.',
	},
};
