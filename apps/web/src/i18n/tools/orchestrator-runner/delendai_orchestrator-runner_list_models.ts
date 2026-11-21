// i18n catalogue for `delendai_orchestrator-runner_list_models`.
//
// Per-tool i18n entry (apps/web/src/i18n/tools/orchestrator-runner/). The
// 12-lang invariant is enforced by `check-i18n.ts` once the entry opts in
// via `apps/web/src/i18n/tools/index.ts` (S9 wiring).

import type { IToolI18n } from '#I18N/tools/_shape';

export const orchestratorRunnerListModelsI18n: IToolI18n = {
	description: {
		en: 'Enumerate the merged provider roster (confirmed roster joined to the healthcheck-applied availability mirror). Each entry carries kind, modelId, costTier, contextWindow, strengths/weaknesses, the runtime state and a cheap reachable boolean (state === "available"). Read-only; reads only the in-memory mirror, so no fs read on the hot path.',
		es: 'Enumera la lista fusionada de proveedores (la lista confirmada unida al espejo de disponibilidad aplicado por el healthcheck). Cada entrada incluye kind, modelId, costTier, contextWindow, fortalezas/debilidades, el estado en runtime y un booleano barato reachable (state === "available"). Solo lectura; lee únicamente el espejo en memoria, por lo que no hay lectura de fs en la ruta caliente.',
		fr: 'Énumère la liste fusionnée des fournisseurs (liste confirmée jointe au miroir de disponibilité appliqué par le healthcheck). Chaque entrée porte kind, modelId, costTier, contextWindow, forces/faiblesses, l\'état d\'exécution et un booléen bon marché reachable (state === "available"). Lecture seule ; ne lit que le miroir en mémoire, donc aucune lecture fs sur le chemin critique.',
		de: 'Zählt die zusammengeführte Anbieterliste auf (bestätigte Liste, verbunden mit dem vom Healthcheck angewandten Verfügbarkeits-Spiegel). Jeder Eintrag trägt kind, modelId, costTier, contextWindow, Stärken/Schwächen, den Laufzeitzustand und einen günstigen reachable-Boolean (state === "available"). Nur lesend; liest nur den In-Memory-Spiegel, also kein fs-Read auf dem heißen Pfad.',
		it: 'Enumera l\'elenco unito dei provider (elenco confermato unito al mirror di disponibilità applicato dall\'healthcheck). Ogni voce riporta kind, modelId, costTier, contextWindow, punti di forza/debolezza, lo stato a runtime e un booleano economico reachable (state === "available"). Sola lettura; legge solo il mirror in memoria, quindi nessuna lettura fs sul percorso caldo.',
		pt: 'Enumera a lista combinada de fornecedores (lista confirmada unida ao espelho de disponibilidade aplicado pelo healthcheck). Cada entrada traz kind, modelId, costTier, contextWindow, forças/fraquezas, o estado em tempo de execução e um booleano barato reachable (state === "available"). Só de leitura; lê apenas o espelho em memória, portanto sem leitura de fs no caminho quente.',
		ja: '統合されたプロバイダーロスター(確定ロスターに、ヘルスチェックが適用された可用性ミラーを結合したもの)を列挙します。各エントリは kind、modelId、costTier、contextWindow、強み/弱み、実行時の state、および安価な reachable ブール値(state === "available")を持ちます。読み取り専用。メモリ内のミラーのみを読むため、ホットパスで fs 読み取りは発生しません。',
		zh: '枚举合并后的提供方名单(已确认名单与健康检查应用后的可用性镜像连接而成)。每个条目包含 kind、modelId、costTier、contextWindow、优势/劣势、运行时 state 以及一个廉价的 reachable 布尔值(state === "available")。只读;仅读取内存镜像,因此热路径上没有 fs 读取。',
		hi: 'संयुक्त प्रदाता सूची की गणना करता है (पुष्ट सूची को हेल्थचेक-लागू उपलब्धता मिरर के साथ जोड़ा गया)। प्रत्येक प्रविष्टि में kind, modelId, costTier, contextWindow, ताकत/कमजोरियाँ, रनटाइम state और एक सस्ता reachable बूलियन (state === "available") होता है। केवल पढ़ने के लिए; केवल इन-मेमोरी मिरर पढ़ता है, इसलिए हॉट पाथ पर कोई fs रीड नहीं।',
		ar: 'يعدّد قائمة المزوّدين المدمجة (القائمة المؤكَّدة مدموجة مع مرآة التوفّر المطبَّق عليها فحص الصحة). تحمل كل مدخلة kind وmodelId وcostTier وcontextWindow ونقاط القوة/الضعف وحالة التشغيل وقيمة منطقية زهيدة reachable ‏(state === "available"). للقراءة فقط؛ لا يقرأ سوى المرآة في الذاكرة، فلا توجد قراءة من نظام الملفات على المسار الساخن.',
		th: 'แจกแจงรายชื่อผู้ให้บริการที่รวมแล้ว (รายชื่อที่ยืนยันแล้วเชื่อมกับมิเรอร์ความพร้อมใช้งานที่ผ่านการตรวจสอบสถานะ) แต่ละรายการมี kind, modelId, costTier, contextWindow, จุดแข็ง/จุดอ่อน, state ขณะทำงาน และค่าบูลีน reachable ราคาถูก (state === "available") อ่านอย่างเดียว; อ่านเฉพาะมิเรอร์ในหน่วยความจำ จึงไม่มีการอ่าน fs บนเส้นทางร้อน',
		vi: 'Liệt kê danh sách nhà cung cấp đã hợp nhất (danh sách đã xác nhận nối với bản sao khả dụng đã áp dụng healthcheck). Mỗi mục mang kind, modelId, costTier, contextWindow, điểm mạnh/điểm yếu, trạng thái lúc chạy và một boolean reachable rẻ (state === "available"). Chỉ đọc; chỉ đọc bản sao trong bộ nhớ, nên không có thao tác đọc fs trên đường nóng.',
	},
};
