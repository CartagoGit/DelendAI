// i18n catalogue for `mcp-vertex_docs_docs_search`.
//
// f00057 S11: `docs_search` is deprecated. The tool returns a typed
// `{ ok: false, error: { reason: 'deprecated', replacement: 'search_search', replacementArgs: { roots: ['docs'] }, since: '0.x.y' } }`
// envelope at runtime; this entry keeps the 12-language description in
// sync so the docs site renders a strikethrough card with the
// replacement link instead of disappearing silently. `site:strict`
// fails the build if a tool loses its catalogue entry, so this file
// is required even for deprecated tools with a documented
// replacement.

import type { IToolI18n } from '#I18N/tools/_shape';

export const docsDocsSearchI18n: IToolI18n = {
	description: {
		en: '[deprecated since 0.x.y] Use search_search with { roots: ["docs"] } instead. This tool returns a typed deprecation envelope and never executes the original search.',
		es: '[obsoleto desde 0.x.y] Usa search_search con { roots: ["docs"] } en su lugar. Esta herramienta devuelve un sobre tipado de obsolescencia y nunca ejecuta la búsqueda original.',
		fr: "[obsolète depuis 0.x.y] Utilisez search_search avec { roots: [\"docs\"] } à la place. Cet outil renvoie une enveloppe d'obsolescence typée et n'exécute jamais la recherche d'origine.",
		de: '[veraltet seit 0.x.y] Verwenden Sie stattdessen search_search mit { roots: ["docs"] }. Dieses Werkzeug gibt eine typisierte Veraltungs-Hülle zurück und führt die ursprüngliche Suche nie aus.',
		it: '[deprecato da 0.x.y] Usa invece search_search con { roots: ["docs"] }. Questo strumento restituisce un\'envelope tipizzata di deprecazione e non esegue mai la ricerca originale.',
		pt: '[obsoleto desde 0.x.y] Use search_search com { roots: ["docs"] } em seu lugar. Esta ferramenta devolve um envelope tipado de obsolescência e nunca executa a pesquisa original.',
		ja: '[0.x.y で廃止] 代わりに search_search を { roots: ["docs"] } で使用してください。このツールは型付けされた廃止エンベロープを返し、元の検索は実行しません。',
		zh: '[自 0.x.y 起已弃用] 请改用 { roots: ["docs"] } 的 search_search。此工具返回类型化的弃用信封,不会执行原始搜索。',
		hi: '[0.x.y से अप्रचलित] इसके बजाय { roots: ["docs"] } के साथ search_search का उपयोग करें। यह टूल एक टाइप किया हुआ अप्रचलन एनवेलप लौटाता है और मूल खोज कभी निष्पादित नहीं करता।',
		ar: '[مهمل منذ 0.x.y] استخدم search_search مع { roots: ["docs"] } بدلاً من ذلك. تُرجع هذه الأداة غلاف إهمال مكتوب ولا تنفذ البحث الأصلي أبداً.',
		th: '[เลิกใช้แล้วตั้งแต่ 0.x.y] ใช้ search_search กับ { roots: ["docs"] } แทน เครื่องมือนี้ส่งคืนซองการเลิกใช้ที่มีการพิมพ์และไม่ดำเนินการค้นหาเดิม',
		vi: '[không dùng từ 0.x.y] Hãy dùng search_search với { roots: ["docs"] } thay thế. Công cụ này trả về một phong bì ngừng sử dụng có kiểu và không bao giờ thực thi tìm kiếm gốc.',
	},
};
