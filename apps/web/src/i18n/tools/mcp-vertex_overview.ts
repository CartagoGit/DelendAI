// i18n catalogue for the `mcp-vertex_overview` tool.
//
// First entry of the per-tool i18n catalogue (apps/web/src/i18n/tools/).
// The shape (`IToolI18n`) is defined in `./_shape.ts`; the convention is
// `<namespace>_<tool>.ts` so the file path matches the descriptionKey the
// tool's registration declares.
//
// This entry exists to exercise the end-to-end flow (descriptionKey →
// catalogue → describeTool → PluginPage) on the most-visited tool. Future
// slices add the remaining tools one by one. `check-i18n.ts` does NOT yet
// enforce 12-language completeness on this file: that tightening is a
// separate proposal so the catalogue can be populated incrementally.

import type { IToolI18n } from '#I18N/tools/_shape';

export const mcpVertexOverviewI18n: IToolI18n = {
	description: {
		en: 'Cold-start map of this MCP server: identity, loaded plugins, every tool with a one-line summary, available knowledge ids, resolved paths and a recommended next action. Read-only. Call this FIRST. Use compact:true (names only) or tag to shrink the payload when there are many tools.',
		es: 'Mapa de arranque en frío de este servidor MCP: identidad, plugins cargados, todas las herramientas con un resumen de una línea, identificadores de conocimiento disponibles, rutas resueltas y la siguiente acción recomendada. Solo lectura. Llama a esto PRIMERO. Usa compact:true (solo nombres) o tag para reducir el payload cuando hay muchas herramientas.',
		fr: 'Carte de démarrage à froid de ce serveur MCP : identité, plugins chargés, chaque outil avec un résumé en une ligne, identifiants de connaissances disponibles, chemins résolus et prochaine action recommandée. Lecture seule. Appelez CECI EN PREMIER. Utilisez compact:true (noms uniquement) ou tag pour réduire la charge utile quand il y a beaucoup d outils.',
		de: 'Kaltstart-Karte dieses MCP-Servers: Identität, geladene Plugins, jedes Werkzeug mit einer einzeiligen Zusammenfassung, verfügbare Wissens-IDs, aufgelöste Pfade und eine empfohlene nächste Aktion. Nur lesbar. Rufe dies ZUERST auf. Verwende compact:true (nur Namen) oder tag, um die Nutzlast zu verkleinern, wenn es viele Werkzeuge gibt.',
		it: 'Mappa di avvio a freddo di questo server MCP: identità, plugin caricati, ogni strumento con un riepilogo di una riga, identificatori di conoscenza disponibili, percorsi risolti e l azione successiva consigliata. Sola lettura. Chiama questo PER PRIMO. Usa compact:true (solo nomi) o tag per ridurre il payload quando ci sono molti strumenti.',
		pt: 'Mapa de arranque a frio deste servidor MCP: identidade, plugins carregados, cada ferramenta com um resumo de uma linha, identificadores de conhecimento disponíveis, caminhos resolvidos e a próxima ação recomendada. Somente leitura. Chame isto PRIMEIRO. Use compact:true (apenas nomes) ou tag para reduzir a carga útil quando há muitas ferramentas.',
		ja: 'この MCP サーバーのコールドスタートマップ:ID、読み込まれたプラグイン、各ツールの 1 行要約、利用可能なナレッジ ID、解決済みパス、推奨される次のアクション。読み取り専用。最初にこれを呼び出してください。ツールが多数ある場合は compact:true(名前のみ)または tag を使用してペイロードを縮小してください。',
		zh: '此 MCP 服务器的冷启动映射:身份、已加载的插件、每个工具的单行摘要、可用知识 ID、已解析路径和推荐的下一个操作。只读。请首先调用此工具。当工具有很多时,使用 compact:true(仅名称)或 tag 来缩小负载。',
		hi: 'इस MCP सर्वर का कोल्ड-स्टार्ट मैप: पहचान, लोड किए गए प्लगइन्स, हर टूल का एक-पंक्ति सारांश, उपलब्ध ज्ञान आईडी, हल किए गए पथ और अनुशंसित अगली क्रिया। केवल पढ़ने के लिए। इसे पहले कॉल करें। जब कई टूल हों तो compact:true(केवल नाम) या tag का उपयोग करके पेलोड को छोटा करें।',
		ar: 'خريطة البدء البارد لخادم MCP هذا: الهوية، والإضافات المحملة، وكل أداة بملخص من سطر واحد، ومعرّفات المعرفة المتاحة، والمسارات المحلولة، والإجراء التالي الموصى به. للقراءة فقط. اتصل بهذا أولاً. استخدم compact:true(الأسماء فقط) أو tag لتقليل الحمولة عندما يكون هناك العديد من الأدوات.',
		th: 'แผนที่เริ่มต้นแบบเย็นของเซิร์ฟเวอร์ MCP นี้: ตัวตน ปลั๊กอินที่โหลด เครื่องมือทุกตัวพร้อมสรุปสั้นหนึ่งบรรทัด รหัสความรู้ที่ใช้ได้ เส้นทางที่แก้ไขแล้ว และการกระทำถัดไปที่แนะนำ อ่านอย่างเดียว เรียกสิ่งนี้ก่อน ใช้ compact:true(ชื่อเท่านั้น) หรือ tag เพื่อลดขนาด payload เมื่อมีเครื่องมือจำนวนมาก',
		vi: 'Bản đồ khởi động nguội của máy chủ MCP này: danh tính, các plugin đã tải, mỗi công cụ với tóm tắt một dòng, các ID kiến thức khả dụng, các đường dẫn đã giải quyết và hành động tiếp theo được đề xuất. Chỉ đọc. Hãy gọi cái này TRƯỚC TIÊN. Sử dụng compact:true (chỉ tên) hoặc tag để thu nhỏ tải trọng khi có nhiều công cụ.',
	},
};
