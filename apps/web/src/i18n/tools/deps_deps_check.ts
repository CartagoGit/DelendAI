// i18n catalogue for `deps_deps_check`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const depsDepsCheckI18n: IToolI18n = {
	description: {
		en: 'Report offline dependency health: missing lockfile (non-reproducible builds), unpinned ranges (*, latest) and deps declared in more than one section. Returns {manifest, lockfile, findings, healthy}. No network / no CVE database.',
		es: 'Informa del estado de las dependencias sin conexión: lockfile ausente (builds no reproducibles), rangos sin fijar (*, latest) y dependencias declaradas en más de una sección. Devuelve {manifest, lockfile, findings, healthy}. Sin red / sin base de datos CVE.',
		fr: "Signale l'état hors ligne des dépendances : lockfile manquant (builds non reproductibles), plages non figées (*, latest) et dépendances déclarées dans plus d'une section. Renvoie {manifest, lockfile, findings, healthy}. Pas de réseau / pas de base CVE.",
		de: 'Meldet den Offline-Gesundheitszustand der Abhängigkeiten: fehlende Lockfile (nicht reproduzierbare Builds), nicht fixierte Bereiche (*, latest) und Abhängigkeiten, die in mehr als einem Abschnitt deklariert sind. Gibt {manifest, lockfile, findings, healthy} zurück. Kein Netzwerk / keine CVE-Datenbank.',
		it: 'Segnala lo stato offline delle dipendenze: lockfile mancante (build non riproducibili), intervalli non fissati (*, latest) e dipendenze dichiarate in più di una sezione. Restituisce {manifest, lockfile, findings, healthy}. Nessuna rete / nessun database CVE.',
		pt: 'Reporta a saúde offline das dependências: lockfile em falta (builds não reprodutíveis), intervalos não fixados (*, latest) e dependências declaradas em mais de uma secção. Devolve {manifest, lockfile, findings, healthy}. Sem rede / sem base de dados CVE.',
		ja: 'オフラインの依存関係の健全性を報告します:lockfile の欠落(再現性のないビルド)、固定されていない範囲(*, latest)、複数のセクションで宣言された依存関係。{manifest, lockfile, findings, healthy} を返します。ネットワークなし / CVE データベースなし。',
		zh: '报告离线依赖健康状况:缺失 lockfile(构建不可重现)、未固定的范围(*、latest)以及在多个区段中重复声明的依赖项。返回 {manifest, lockfile, findings, healthy}。无网络 / 无 CVE 数据库。',
		hi: 'ऑफ़लाइन निर्भरता स्वास्थ्य की रिपोर्ट करता है: गुम लॉकफ़ाइल (अप्रतिकृत बिल्ड), अनपिन की गई रेंज (*, latest), और एक से अधिक सेक्शन में घोषित निर्भरताएँ। {manifest, lockfile, findings, healthy} लौटाता है। कोई नेटवर्क नहीं / कोई CVE डेटाबेस नहीं।',
		ar: 'يُبلغ عن سلامة التبعيات دون اتصال: ملف lockfile مفقود (بنى غير قابلة لإعادة الإنتاج)، نطاقات غير مثبتة (*, latest)، وتبعيات معلنة في أكثر من قسم واحد. يُرجع {manifest, lockfile, findings, healthy}. بدون شبكة / بدون قاعدة بيانات CVE.',
		th: 'รายงานสถานะดีเพนเดนซีแบบออฟไลน์: lockfile ที่ขาดหายไป (บิลด์ที่ทำซ้ำไม่ได้) ช่วงเวอร์ชันที่ไม่ตรึง (*, latest) และดีเพนเดนซีที่ประกาศในมากกว่าหนึ่งส่วน ส่งคืน {manifest, lockfile, findings, healthy} ไม่มีเครือข่าย / ไม่มีฐานข้อมูล CVE',
		vi: 'Báo cáo tình trạng dependency ngoại tuyến: thiếu lockfile (build không thể tái lập), dải phiên bản không cố định (*, latest) và dependency được khai báo ở nhiều hơn một phần. Trả về {manifest, lockfile, findings, healthy}. Không có mạng / không có cơ sở dữ liệu CVE.',
	},
};
