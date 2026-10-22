// i18n catalogue for `delendai_logs_query`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const logsQueryI18n: IToolI18n = {
	description: {
		en: 'Query redacted append-only MCP log events. Filters: since, until, kind, agent, taskId, outcome; supports cursor pagination. `detail` defaults to `full` (the stored event with its summary and metadata redacted); `normal` empties meta and `compact` keeps only the incident summary envelope.',
		es: 'Consulta eventos redactados del registro MCP de solo anexado. Filtros: since, until, kind, agent, taskId, outcome; admite paginación por cursor. `detail` es `full` por defecto (el evento almacenado con su resumen y metadatos redactados); `normal` vacía meta y `compact` conserva solo el sobre de resumen del incidente.',
		fr: "Interroge les événements expurgés du journal MCP en ajout seul. Filtres : since, until, kind, agent, taskId, outcome ; prend en charge la pagination par curseur. `detail` vaut `full` par défaut (l'événement stocké avec son résumé et ses métadonnées expurgés) ; `normal` vide meta et `compact` ne garde que l'enveloppe de résumé de l'incident.",
		de: 'Fragt geschwärzte Ereignisse des Nur-Anhänge-MCP-Protokolls ab. Filter: since, until, kind, agent, taskId, outcome; unterstützt Cursor-Paginierung. `detail` ist standardmäßig `full` (das gespeicherte Ereignis mit geschwärzter Zusammenfassung und Metadaten); `normal` leert meta und `compact` behält nur den Umschlag mit der Vorfallzusammenfassung.',
		it: "Interroga gli eventi oscurati del registro MCP in sola aggiunta. Filtri: since, until, kind, agent, taskId, outcome; supporta la paginazione a cursore. `detail` è `full` per impostazione predefinita (l'evento memorizzato con riepilogo e metadati oscurati); `normal` svuota meta e `compact` mantiene solo l'involucro di riepilogo dell'incidente.",
		pt: 'Consulta eventos redigidos do registo MCP só de acréscimo. Filtros: since, until, kind, agent, taskId, outcome; suporta paginação por cursor. `detail` é `full` por omissão (o evento guardado com o resumo e os metadados redigidos); `normal` esvazia meta e `compact` mantém só o envelope de resumo do incidente.',
		ja: '追記専用で秘匿化された MCP ログのイベントを検索します。フィルター:since、until、kind、agent、taskId、outcome。カーソルによるページングに対応します。`detail` の既定は `full`(保存されたイベントを要約とメタデータを秘匿化して返す)で、`normal` は meta を空にし、`compact` はインシデント要約のエンベロープだけを残します。',
		zh: '查询经过脱敏的仅追加 MCP 日志事件。筛选条件:since、until、kind、agent、taskId、outcome;支持游标分页。`detail` 默认为 `full`(返回已存储的事件,其摘要和元数据经过脱敏);`normal` 会清空 meta,`compact` 只保留事件摘要信封。',
		hi: 'गोपनीय किए गए, केवल-जोड़ने वाले MCP लॉग की घटनाएँ खोजता है। फ़िल्टर: since, until, kind, agent, taskId, outcome; कर्सर पेजिनेशन समर्थित। `detail` डिफ़ॉल्ट रूप से `full` है (संग्रहीत घटना, उसके सारांश और मेटाडेटा को गोपनीय करके); `normal` meta को ख़ाली करता है और `compact` केवल घटना-सारांश का लिफ़ाफ़ा रखता है।',
		ar: 'يستعلم عن أحداث سجل MCP الإلحاقي فقط بعد تنقيحها. المرشحات: since وuntil وkind وagent وtaskId وoutcome؛ ويدعم الترقيم بالمؤشر. القيمة الافتراضية لـ `detail` هي `full` (الحدث المخزّن مع تنقيح ملخصه وبياناته الوصفية)؛ و`normal` يفرّغ meta، و`compact` يبقي غلاف ملخص الحادثة فقط.',
		th: 'ค้นหาเหตุการณ์ในบันทึก MCP แบบเพิ่มต่อท้ายเท่านั้นที่ปกปิดข้อมูลแล้ว ตัวกรอง: since, until, kind, agent, taskId, outcome รองรับการแบ่งหน้าด้วยเคอร์เซอร์ `detail` มีค่าเริ่มต้นเป็น `full` (เหตุการณ์ที่เก็บไว้ โดยปกปิดสรุปและเมทาดาทา) `normal` ล้าง meta ให้ว่าง และ `compact` เก็บไว้เฉพาะซองสรุปเหตุการณ์',
		vi: 'Truy vấn các sự kiện đã che trong nhật ký MCP chỉ-ghi-thêm. Bộ lọc: since, until, kind, agent, taskId, outcome; hỗ trợ phân trang bằng con trỏ. `detail` mặc định là `full` (sự kiện đã lưu, với phần tóm tắt và siêu dữ liệu đã được che); `normal` làm rỗng meta và `compact` chỉ giữ phong bì tóm tắt sự cố.',
	},
};
