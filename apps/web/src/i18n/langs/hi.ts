import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "अवधारणा",
	"nav.install": "इंस्टॉल",
	"nav.tools": "टूल",
	"nav.benchmarks": "बेंचमार्क",
	"nav.plugins": "प्लगइन",
	"nav.github": "GitHub",
	"hero.title.a": "प्रोजेक्ट-निरपेक्ष ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": "",
	"hero.subheader": "किसी भी प्रोजेक्ट के लिए MCP सर्वर कोर + प्लगइन लोडर।",
	"hero.tagline":
		"एक प्रोजेक्ट-निरपेक्ष Model Context Protocol सर्वर कोर। कोर को आपके डोमेन के बारे में कुछ नहीं पता — क्षमताएँ प्लगइन के रूप में आती हैं जिन्हें आप माँग पर लोड करते हैं, सभी कम टोकन लागत के लिए मापी गई।",
	"hero.ctaInstall": "शुरू करें",
	"hero.ctaTools": "टूल देखें",
	"hero.runsOn": "Node, Deno और bun पर चलता है · कोई भी पैकेज मैनेजर",
	"marquee.runtimes": "किससे बना · किस पर चलता",
	"marquee.clients": "MCP क्लाइंट और मॉडल",
	"concept.title": "एक छोटा कोर, कई प्लगइन",
	"concept.body":
		"mcp-vertex वह सीलबंद कोर है: नियतात्मक टूल पंजीकरण, इंजेक्ट किए गए workspace पथ, एक CLI प्लगइन लोडर, और टोकन में मापी गई टूल सतह। डोमेन-विशिष्ट सब कुछ एक प्लगइन है — केवल वही लोड करें जो चाहिए, किसी भी होस्ट या मॉडल के तहत।",
	"concept.f1.t": "प्रोजेक्ट-निरपेक्ष",
	"concept.f1.b":
		"कोर में कोई डोमेन कोड नहीं। वही प्लगइन हर होस्ट या मॉडल पर एक जैसा व्यवहार करता है।",
	"concept.f2.t": "डिज़ाइन से कम-टोकन",
	"concept.f2.b":
		"एकल overview, आलसी ज्ञान और संक्षिप्त JSON। एक मापा बजट CI में रिग्रेशन रोकता है।",
	"concept.f3.t": "सुरक्षित समवर्तीता",
	"concept.f3.b":
		"परमाणु लेखन, स्वामित्व टोकन वाला क्रॉस-प्रोसेस म्यूटेक्स, और भ्रष्टाचार क्वारंटाइन।",
	"concept.f4.t": "मल्टी-एजेंट के लिए तैयार",
	"concept.f4.b":
		"proposals प्लगइन एक swarm समन्वयित करता है: लॉक, कार्य कतार, slice असंयुक्तता और पुश सूचनाएँ।",
	"install.title": "इंस्टॉल और चलाएँ",
	"install.lead": "इसे जोड़ें और अपने MCP क्लाइंट को mcp-vertex बाइनरी की ओर इंगित करें:",
	"install.verify": "चलता है यह जाँचें",
	"install.addto": "अपने IDE / एजेंट में जोड़ें",
	"install.presets": "प्रीसेट:",
	"install.oneCmd": "एक कमांड · कोई भी IDE",
	"install.oneCmdNote": "आपका IDE पहचानकर mcp-vertex जोड़ता है — आपके बाकी MCP सर्वर को छुए बिना।",
	"install.config":
		"एक प्रीसेट चुनें (minimal · standard · swarm) या प्लगइन स्पष्ट रूप से सूचीबद्ध करें। स्व-निदान के लिए --check के साथ चलाएँ।",
	"tools.title": "टूल",
	"tools.lead":
		"पूर्ण प्लगइन सेट द्वारा उजागर हर टूल, namespace के अनुसार समूहित — जीवित रजिस्ट्री से लिया गया, इसलिए यह पृष्ठ कभी कोड से अलग नहीं होता।",
	"tools.count": "टूल",
	"tools.packages": "पैकेज",
	"bench.title": "मापा गया, दावा नहीं",
	"bench.lead":
		"टोकन दक्षता एक संरक्षित अपरिवर्तनीय है — यदि ये सीमाएँ रिग्रेस हों तो CI टेस्ट विफल होता है।",
	"bench.b1.t": "कोल्ड-स्टार्ट",
	"bench.b1.b":
		"overview (संक्षिप्त) + auto_work — 300 टोकन से कम में पूर्ण अभिविन्यास।",
	"bench.b2.t": "कोई पोलिंग नहीं",
	"bench.b2.b":
		"लॉक-रिलीज़ पुश किया जाता है (notification प्लगइन), लूप में पोल नहीं।",
	"bench.b3.t": "ड्रिफ्ट-संरक्षित",
	"bench.b3.b":
		"एक जनित टाइप SDK, टोकन बजट और असली प्रोटोकॉल पर सख्त e2e जाल।",
	"bench.live.title": "अभिविन्यास लागत · सीधे मापा गया",
	"bench.live.note":
		"एजेंट जो परिणाम पाठ देखता है उसके टोकन (≈4 बाइट/टोकन), proposals+memory के साथ प्रोटोकॉल पर सीधे मापे गए। बेसलाइन हाथ से अभिविन्यास का एक उदाहरणात्मक अनुमान है — किसी तीसरे-पक्ष टूल का माप नहीं।",
	"bench.baseline": "mcp-vertex के बिना (हाथ से · अनुमान)",
	"plugins.title": "प्लगइन",
	"plugins.lead":
		"प्रकाशित पैकेज। केवल जो चाहिए वही लोड करें; कोर छोटा रहता है।",
	"cfg.title": "सेटिंग्स",
	"cfg.theme": "थीम",
	"cfg.language": "भाषा",
	"cfg.motion": "एनिमेशन",
	"cfg.motionLabel": "मार्की को एनिमेट करें",
	"footer.built": "जीवित टूल रजिस्ट्री से जनित।",
	"pluginpage.back": "वापस",
	"pluginpage.tools": "टूल",
	"pluginpage.install": "इंस्टॉल",
	"plugin.proposals":
		"मल्टी-एजेंट समन्वय: लॉक, कार्य कतार, slices, round-context, स्थिति मरम्मत।",
	"plugin.git": "केवल-पढ़ने योग्य रिपॉजिटरी निरीक्षण: status, बदली फाइलें, diff, log।",
	"plugin.memory":
		"सत्रों के बीच टिकाऊ नोट्स, BM25 रिकॉल, कोटा, TTL और सीक्रेट रिडैक्शन के साथ।",
	"plugin.search": "कम-लागत workspace खोज: substring या regex, glob शामिल/बहिष्कृत।",
	"plugin.rules": "फ्रेमवर्क पहचान + lint/परंपरा मार्गदर्शन; प्रोजेक्ट कॉन्फ़िग प्राथमिकता।",
	"plugin.quality": "गुणवत्ता गेट चलाएँ (lint/test/build) allow/deny नीति के साथ; रद्द करने योग्य।",
	"plugin.docs": "प्रोजेक्ट markdown दस्तावेज़ कैटलॉग करें और पढ़ें, कम-लागत क्यूरेटेड नेविगेशन।",
	"plugin.deps": "ऑफ़लाइन निर्भरता सूची + स्वास्थ्य (lockfile, ढीली रेंज, डुप्लिकेट)।",
	"plugin.notification": "लॉक-रिलीज़ इवेंट पुश करता है ताकि एजेंट पोलिंग बंद करें।",
	"plugin.core": "निरपेक्ष कोर: overview, scaffold, मेट्रिक्स, doctor और प्लगइन लोडर।",
};

export default dict;
export { dict };