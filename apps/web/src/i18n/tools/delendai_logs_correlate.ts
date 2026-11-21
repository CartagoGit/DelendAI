// i18n catalogue for `delendai_logs_correlate`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const logsCorrelateI18n: IToolI18n = {
	description: {
		en: 'Build a chronological chain for exactly one taskId or agent and return gap detection. `detail` defaults to `full` (the stored event with its summary and metadata redacted); `normal` empties meta and `compact` keeps only the incident summary envelope.',
		es: 'Construye una cadena cronológica para exactamente un taskId o un agente y devuelve la detección de huecos. `detail` es `full` por defecto (el evento almacenado con su resumen y metadatos redactados); `normal` vacía meta y `compact` conserva solo el sobre de resumen del incidente.',
		fr: "Construit une chaîne chronologique pour exactement un taskId ou un agent et renvoie la détection des trous. `detail` vaut `full` par défaut (l'événement stocké avec son résumé et ses métadonnées expurgés) ; `normal` vide meta et `compact` ne garde que l'enveloppe de résumé de l'incident.",
		de: 'Baut eine chronologische Kette für genau eine taskId oder einen Agenten und liefert die Lückenerkennung. `detail` ist standardmäßig `full` (das gespeicherte Ereignis mit geschwärzter Zusammenfassung und Metadaten); `normal` leert meta und `compact` behält nur den Umschlag mit der Vorfallzusammenfassung.',
		it: "Costruisce una catena cronologica per esattamente un taskId o un agente e restituisce il rilevamento dei vuoti. `detail` è `full` per impostazione predefinita (l'evento memorizzato con riepilogo e metadati oscurati); `normal` svuota meta e `compact` mantiene solo l'involucro di riepilogo dell'incidente.",
		pt: 'Constrói uma cadeia cronológica para exatamente um taskId ou um agente e devolve a deteção de lacunas. `detail` é `full` por omissão (o evento guardado com o resumo e os metadados redigidos); `normal` esvazia meta e `compact` mantém só o envelope de resumo do incidente.',
		ja: 'ちょうど 1 つの taskId またはエージェントについて時系列のチェーンを組み立て、欠落の検出結果を返します。`detail` の既定は `full`(保存されたイベントを要約とメタデータを秘匿化して返す)で、`normal` は meta を空にし、`compact` はインシデント要約のエンベロープだけを残します。',
		zh: '为恰好一个 taskId 或智能体构建按时间排列的链条,并返回缺口检测结果。`detail` 默认为 `full`(返回已存储的事件,其摘要和元数据经过脱敏);`normal` 会清空 meta,`compact` 只保留事件摘要信封。',
		hi: 'ठीक एक taskId या एजेंट के लिए कालानुक्रमिक शृंखला बनाता है और अंतराल का पता लगाकर लौटाता है। `detail` डिफ़ॉल्ट रूप से `full` है (संग्रहीत घटना, उसके सारांश और मेटाडेटा को गोपनीय करके); `normal` meta को ख़ाली करता है और `compact` केवल घटना-सारांश का लिफ़ाफ़ा रखता है।',
		ar: 'يبني سلسلة زمنية لمعرّف مهمة taskId واحد بالضبط أو لوكيل واحد، ويعيد اكتشاف الفجوات. القيمة الافتراضية لـ `detail` هي `full` (الحدث المخزّن مع تنقيح ملخصه وبياناته الوصفية)؛ و`normal` يفرّغ meta، و`compact` يبقي غلاف ملخص الحادثة فقط.',
		th: 'สร้างลำดับเหตุการณ์ตามเวลาสำหรับ taskId หรือเอเจนต์เพียงหนึ่งรายการ แล้วคืนผลการตรวจหาช่องว่าง `detail` มีค่าเริ่มต้นเป็น `full` (เหตุการณ์ที่เก็บไว้ โดยปกปิดสรุปและเมทาดาทา) `normal` ล้าง meta ให้ว่าง และ `compact` เก็บไว้เฉพาะซองสรุปเหตุการณ์',
		vi: 'Dựng một chuỗi theo thời gian cho đúng một taskId hoặc một tác tử và trả về kết quả phát hiện khoảng trống. `detail` mặc định là `full` (sự kiện đã lưu, với phần tóm tắt và siêu dữ liệu đã được che); `normal` làm rỗng meta và `compact` chỉ giữ phong bì tóm tắt sự cố.',
	},
};
