// i18n catalogue for `search_search`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const searchSearchI18n: IToolI18n = {
	description: {
		en: 'Search the workspace text files and return matching {file,line,text} hits. `query` is a substring by default, or a JS regex with regex:true. Narrow by path with `include`/`exclude` globs (e.g. "src/**/*.ts"). Low-token: results and per-line previews are capped.',
		es: 'Busca en los ficheros de texto del workspace y devuelve coincidencias {file,line,text}. `query` es una subcadena por defecto, o una regex de JS con regex:true. Limita por ruta con globs `include`/`exclude` (p. ej. "src/**/*.ts"). Pocos tokens: los resultados y las vistas previas por línea están limitados.',
		fr: 'Recherche dans les fichiers texte de l\'espace de travail et renvoie les correspondances {file,line,text}. `query` est une sous-chaîne par défaut, ou une regex JS avec regex:true. Limitez par chemin avec des globs `include`/`exclude` (par ex. "src/**/*.ts"). Peu de tokens : les résultats et les aperçus par ligne sont plafonnés.',
		de: 'Durchsucht die Textdateien des Workspace und gibt übereinstimmende {file,line,text}-Treffer zurück. `query` ist standardmäßig eine Teilzeichenfolge oder ein JS-Regex mit regex:true. Eingrenzen nach Pfad mit `include`/`exclude`-Globs (z. B. "src/**/*.ts"). Wenig Tokens: Ergebnisse und zeilenweise Vorschauen sind begrenzt.',
		it: 'Cerca nei file di testo del workspace e restituisce corrispondenze {file,line,text}. `query` è una sottostringa per impostazione predefinita, o una regex JS con regex:true. Restringi per percorso con glob `include`/`exclude` (es. "src/**/*.ts"). Pochi token: i risultati e le anteprime per riga sono limitati.',
		pt: 'Pesquisa nos ficheiros de texto do workspace e devolve correspondências {file,line,text}. `query` é uma substring por defeito, ou uma regex JS com regex:true. Restringe por caminho com globs `include`/`exclude` (ex. "src/**/*.ts"). Poucos tokens: os resultados e as pré-visualizações por linha são limitados.',
		ja: 'workspace のテキストファイルを検索し、一致する {file,line,text} のヒットを返します。`query` はデフォルトで部分文字列、または regex:true で JS の正規表現になります。`include`/`exclude` の glob(例:"src/**/*.ts")でパスを絞り込みます。低トークン:結果と行ごとのプレビューは上限があります。',
		zh: '搜索工作区文本文件并返回匹配的 {file,line,text} 结果。`query` 默认为子字符串,或在 regex:true 时为 JS 正则表达式。可使用 `include`/`exclude` glob(例如 "src/**/*.ts")按路径缩小范围。低令牌:结果数量和每行预览都有上限。',
		hi: 'वर्कस्पेस की टेक्स्ट फ़ाइलों में खोजता है और मिलान करने वाले {file,line,text} हिट्स लौटाता है। `query` डिफ़ॉल्ट रूप से एक सबस्ट्रिंग है, या regex:true के साथ एक JS regex है। `include`/`exclude` ग्लोब्स (जैसे "src/**/*.ts") से पथ द्वारा सीमित करें। कम-टोकन: परिणाम और प्रति-लाइन पूर्वावलोकन सीमित हैं।',
		ar: 'يبحث في ملفات نص مساحة العمل ويُرجع نتائج مطابقة {file,line,text}. `query` هو سلسلة فرعية بشكل افتراضي، أو تعبير نمطي JS مع regex:true. ضيّق النطاق بحسب المسار باستخدام أنماط glob `include`/`exclude` (مثل "src/**/*.ts"). رموز قليلة: النتائج والمعاينات لكل سطر محدودة.',
		th: 'ค้นหาไฟล์ข้อความในเวิร์กสเปซและส่งคืนผลลัพธ์ที่ตรงกัน {file,line,text} `query` เป็นซับสตริงโดยค่าเริ่มต้น หรือ regex ของ JS ด้วย regex:true จำกัดตามพาธด้วย glob `include`/`exclude` (เช่น "src/**/*.ts") โทเค็นน้อย: ผลลัพธ์และตัวอย่างต่อบรรทัดมีการจำกัด',
		vi: 'Tìm kiếm các tệp văn bản trong workspace và trả về các kết quả khớp {file,line,text}. `query` mặc định là một chuỗi con, hoặc là regex JS khi dùng regex:true. Thu hẹp theo đường dẫn bằng glob `include`/`exclude` (ví dụ "src/**/*.ts"). Ít token: số kết quả và bản xem trước theo dòng đều có giới hạn.',
	},
};
