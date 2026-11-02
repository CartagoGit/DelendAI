// i18n catalogue for `delendai_logs_subscribe`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const logsSubscribeI18n: IToolI18n = {
	description: {
		en: 'Return recent redacted log events matching optional outcome/kind filters. `detail` defaults to `full` (the stored event with its summary and metadata redacted); `normal` empties meta and `compact` keeps only the incident summary envelope.',
		es: 'Devuelve eventos de registro recientes y redactados que cumplen los filtros opcionales de outcome/kind. `detail` es `full` por defecto (el evento almacenado con su resumen y metadatos redactados); `normal` vacía meta y `compact` conserva solo el sobre de resumen del incidente.',
		fr: "Renvoie les événements récents et expurgés du journal correspondant aux filtres facultatifs outcome/kind. `detail` vaut `full` par défaut (l'événement stocké avec son résumé et ses métadonnées expurgés) ; `normal` vide meta et `compact` ne garde que l'enveloppe de résumé de l'incident.",
		de: 'Liefert aktuelle geschwärzte Protokollereignisse, die den optionalen Filtern outcome/kind entsprechen. `detail` ist standardmäßig `full` (das gespeicherte Ereignis mit geschwärzter Zusammenfassung und Metadaten); `normal` leert meta und `compact` behält nur den Umschlag mit der Vorfallzusammenfassung.',
		it: "Restituisce gli eventi di registro recenti e oscurati che corrispondono ai filtri facoltativi outcome/kind. `detail` è `full` per impostazione predefinita (l'evento memorizzato con riepilogo e metadati oscurati); `normal` svuota meta e `compact` mantiene solo l'involucro di riepilogo dell'incidente.",
		pt: 'Devolve eventos de registo recentes e redigidos que correspondem aos filtros opcionais outcome/kind. `detail` é `full` por omissão (o evento guardado com o resumo e os metadados redigidos); `normal` esvazia meta e `compact` mantém só o envelope de resumo do incidente.',
		ja: '任意の outcome/kind フィルターに合う、秘匿化済みの最近のログイベントを返します。`detail` の既定は `full`(保存されたイベントを要約とメタデータを秘匿化して返す)で、`normal` は meta を空にし、`compact` はインシデント要約のエンベロープだけを残します。',
		zh: '返回符合可选 outcome/kind 筛选条件的近期脱敏日志事件。`detail` 默认为 `full`(返回已存储的事件,其摘要和元数据经过脱敏);`normal` 会清空 meta,`compact` 只保留事件摘要信封。',
		hi: 'वैकल्पिक outcome/kind फ़िल्टर से मेल खाती हाल की, गोपनीय की गई लॉग घटनाएँ लौटाता है। `detail` डिफ़ॉल्ट रूप से `full` है (संग्रहीत घटना, उसके सारांश और मेटाडेटा को गोपनीय करके); `normal` meta को ख़ाली करता है और `compact` केवल घटना-सारांश का लिफ़ाफ़ा रखता है।',
		ar: 'يعيد أحداث السجل الحديثة المنقّحة المطابقة لمرشحات outcome/kind الاختيارية. القيمة الافتراضية لـ `detail` هي `full` (الحدث المخزّن مع تنقيح ملخصه وبياناته الوصفية)؛ و`normal` يفرّغ meta، و`compact` يبقي غلاف ملخص الحادثة فقط.',
		th: 'คืนเหตุการณ์บันทึกล่าสุดที่ปกปิดข้อมูลแล้วซึ่งตรงกับตัวกรอง outcome/kind ที่เลือกได้ `detail` มีค่าเริ่มต้นเป็น `full` (เหตุการณ์ที่เก็บไว้ โดยปกปิดสรุปและเมทาดาทา) `normal` ล้าง meta ให้ว่าง และ `compact` เก็บไว้เฉพาะซองสรุปเหตุการณ์',
		vi: 'Trả về các sự kiện nhật ký gần đây đã được che, khớp với bộ lọc outcome/kind tùy chọn. `detail` mặc định là `full` (sự kiện đã lưu, với phần tóm tắt và siêu dữ liệu đã được che); `normal` làm rỗng meta và `compact` chỉ giữ phong bì tóm tắt sự cố.',
	},
};
