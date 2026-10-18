// i18n catalogue for `delendai_memory_list`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const memoryListI18n: IToolI18n = {
	description: {
		en: 'List durable notes as a cheap index {id,title,tags}, newest first. Paginated: `limit` (default 50, max 200) + `offset`. Returns {notes,total,offset,nextOffset}. Read a body with memory_recall only when the index suggests the note is relevant.',
		es: 'Lista las notas duraderas como un índice barato {id,title,tags}, de la más reciente a la más antigua. Paginado: `limit` (50 por defecto, máximo 200) + `offset`. Devuelve {notes,total,offset,nextOffset}. Lee el cuerpo con memory_recall solo cuando el índice sugiera que la nota es relevante.',
		fr: "Liste les notes durables sous forme d'index léger {id,title,tags}, des plus récentes aux plus anciennes. Paginé : `limit` (50 par défaut, 200 au plus) + `offset`. Renvoie {notes,total,offset,nextOffset}. Ne lisez un corps avec memory_recall que lorsque l'index indique que la note est pertinente.",
		de: 'Listet dauerhafte Notizen als günstigen Index {id,title,tags}, neueste zuerst. Seitenweise: `limit` (Standard 50, höchstens 200) + `offset`. Liefert {notes,total,offset,nextOffset}. Lies einen Inhalt mit memory_recall nur, wenn der Index nahelegt, dass die Notiz relevant ist.',
		it: "Elenca le note durevoli come indice economico {id,title,tags}, dalle più recenti. Paginato: `limit` (50 predefinito, massimo 200) + `offset`. Restituisce {notes,total,offset,nextOffset}. Leggi il corpo con memory_recall solo quando l'indice suggerisce che la nota è pertinente.",
		pt: 'Lista as notas duradouras como um índice barato {id,title,tags}, das mais recentes para as mais antigas. Paginado: `limit` (50 por omissão, máximo 200) + `offset`. Devolve {notes,total,offset,nextOffset}. Leia o corpo com memory_recall só quando o índice sugerir que a nota é relevante.',
		ja: '永続的なノートを低コストのインデックス {id,title,tags} として新しい順に一覧表示します。ページング:`limit`(既定 50、最大 200)+ `offset`。{notes,total,offset,nextOffset} を返します。本文は、インデックスから関連がありそうだと分かったときにだけ memory_recall で読みます。',
		zh: '以低成本索引 {id,title,tags} 列出持久笔记,最新的在前。分页:`limit`(默认 50,最大 200)+ `offset`。返回 {notes,total,offset,nextOffset}。只有当索引显示该笔记相关时,才用 memory_recall 读取正文。',
		hi: 'स्थायी नोटों को सस्ते सूचकांक {id,title,tags} के रूप में, सबसे नए पहले, सूचीबद्ध करता है। पेजिनेटेड: `limit` (डिफ़ॉल्ट 50, अधिकतम 200) + `offset`। {notes,total,offset,nextOffset} लौटाता है। किसी नोट का मुख्य भाग memory_recall से तभी पढ़ें जब सूचकांक बताए कि वह प्रासंगिक है।',
		ar: 'يسرد الملاحظات الدائمة كفهرس رخيص {id,title,tags}، الأحدث أولًا. مقسّم إلى صفحات: `limit` (الافتراضي 50، والحد الأقصى 200) + `offset`. يعيد {notes,total,offset,nextOffset}. اقرأ المتن بـ memory_recall فقط حين يشير الفهرس إلى أن الملاحظة ذات صلة.',
		th: 'แสดงบันทึกถาวรเป็นดัชนีราคาถูก {id,title,tags} เรียงจากใหม่ไปเก่า แบ่งหน้า: `limit` (ค่าเริ่มต้น 50 สูงสุด 200) + `offset` คืน {notes,total,offset,nextOffset} อ่านเนื้อหาด้วย memory_recall เฉพาะเมื่อดัชนีบ่งว่าบันทึกนั้นเกี่ยวข้อง',
		vi: 'Liệt kê các ghi chú bền vững dưới dạng chỉ mục rẻ {id,title,tags}, mới nhất trước. Có phân trang: `limit` (mặc định 50, tối đa 200) + `offset`. Trả về {notes,total,offset,nextOffset}. Chỉ đọc phần nội dung bằng memory_recall khi chỉ mục cho thấy ghi chú có liên quan.',
	},
};
