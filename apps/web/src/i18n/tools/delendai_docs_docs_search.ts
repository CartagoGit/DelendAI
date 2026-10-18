// i18n catalogue for `delendai_docs_docs_search`.
//
// f00057 S11: `docs_search` is deprecated. The tool returns a typed
// `{ ok: false, error: { reason: 'deprecated', replacement: 'search_search', replacementArgs: { roots: ['docs'] }, since: '0.1.0' } }`
// envelope at runtime; this entry keeps the 12-language description in
// sync so the docs site renders a strikethrough card with the
// replacement link instead of disappearing silently. `site:strict`
// fails the build if a tool loses its catalogue entry, so this file
// is required even for deprecated tools with a documented
// replacement.

import type { IToolI18n } from '#I18N/tools/_shape';

export const docsDocsSearchI18n: IToolI18n = {
	description: {
		en: '[deprecated since 0.1.0] Use search_search { roots: ["docs"] } for the same hits. This tool returns a typed deprecation envelope and never executes the original search.',
		es: '[obsoleta desde 0.1.0] Usa search_search { roots: ["docs"] } para obtener los mismos resultados. Esta herramienta devuelve un sobre tipado de obsolescencia y nunca ejecuta la búsqueda original.',
		fr: "[obsolète depuis 0.1.0] Utilisez search_search { roots: [\"docs\"] } pour les mêmes résultats. Cet outil renvoie une enveloppe d'obsolescence typée et n'exécute jamais la recherche d'origine.",
		de: '[veraltet seit 0.1.0] Nutze search_search { roots: ["docs"] } für dieselben Treffer. Dieses Werkzeug liefert einen typisierten Veraltungs-Umschlag und führt die ursprüngliche Suche nie aus.',
		it: '[deprecato dalla 0.1.0] Usa search_search { roots: ["docs"] } per gli stessi risultati. Questo strumento restituisce un involucro di deprecazione tipizzato e non esegue mai la ricerca originale.',
		pt: '[obsoleta desde 0.1.0] Use search_search { roots: ["docs"] } para os mesmos resultados. Esta ferramenta devolve um envelope de obsolescência tipado e nunca executa a pesquisa original.',
		ja: '[0.1.0 以降は非推奨] 同じ結果には search_search { roots: ["docs"] } を使ってください。このツールは型付きの非推奨エンベロープを返し、元の検索は実行しません。',
		zh: '[自 0.1.0 起弃用] 使用 search_search { roots: ["docs"] } 可得到相同的结果。该工具返回带类型的弃用信封,从不执行原来的搜索。',
		hi: '[0.1.0 से अप्रचलित] वही परिणाम पाने के लिए search_search { roots: ["docs"] } का उपयोग करें। यह टूल एक टाइप किया हुआ अप्रचलन लिफ़ाफ़ा लौटाता है और मूल खोज कभी नहीं चलाता।',
		ar: '[مُهمَل منذ 0.1.0] استخدم search_search { roots: ["docs"] } للحصول على النتائج نفسها. تعيد هذه الأداة غلاف إهمال محدد النوع ولا تنفّذ البحث الأصلي أبدًا.',
		th: '[เลิกใช้ตั้งแต่ 0.1.0] ใช้ search_search { roots: ["docs"] } เพื่อผลลัพธ์เดียวกัน เครื่องมือนี้คืนซองแจ้งการเลิกใช้แบบมีชนิด และไม่รันการค้นหาเดิมเลย',
		vi: '[không còn dùng từ 0.1.0] Dùng search_search { roots: ["docs"] } để có cùng kết quả. Công cụ này trả về một phong bì báo ngừng dùng có kiểu và không bao giờ chạy tìm kiếm gốc.',
	},
};
