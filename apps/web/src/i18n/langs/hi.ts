import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'अवधारणा',
		install: 'इंस्टॉल',
		tools: 'टूल',
		benchmarks: 'बेंचमार्क',
		plugins: 'प्लगइन',
		github: 'GitHub',
	},
	hero: {
		title: { a: 'प्रोजेक्ट-निरपेक्ष ', b: 'MCP Vertex', c: '' },
		subheader: 'किसी भी प्रोजेक्ट के लिए MCP सर्वर कोर + प्लगइन लोडर।',
		tagline:
			'एक प्रोजेक्ट-निरपेक्ष Model Context Protocol सर्वर कोर। कोर को आपके डोमेन के बारे में कुछ नहीं पता — क्षमताएँ प्लगइन के रूप में आती हैं जिन्हें आप माँग पर लोड करते हैं, सभी कम टोकन लागत के लिए मापी गई।',
		ctaInstall: 'शुरू करें',
		ctaTools: 'टूल देखें',
		runsOn: 'Node, Deno और bun पर चलता है · कोई भी पैकेज मैनेजर',
	},
	marquee: {
		runtimes: 'किससे बना · किस पर चलता',
		clients: 'MCP क्लाइंट और मॉडल',
	},
	concept: {
		title: 'एक छोटा कोर, कई प्लगइन',
		body: 'mcp-vertex वह सीलबंद कोर है: नियतात्मक टूल पंजीकरण, इंजेक्ट किए गए workspace पथ, एक CLI प्लगइन लोडर, और टोकन में मापी गई टूल सतह। डोमेन-विशिष्ट सब कुछ एक प्लगइन है — केवल वही लोड करें जो चाहिए, किसी भी होस्ट या मॉडल के तहत।',
		f1: {
			t: 'प्रोजेक्ट-निरपेक्ष',
			b: 'कोर में कोई डोमेन कोड नहीं। वही प्लगइन हर होस्ट या मॉडल पर एक जैसा व्यवहार करता है।',
		},
		f2: {
			t: 'डिज़ाइन से कम-टोकन',
			b: 'एकल overview, आलसी ज्ञान और संक्षिप्त JSON। एक मापा बजट CI में रिग्रेशन रोकता है।',
		},
		f3: {
			t: 'सुरक्षित समवर्तीता',
			b: 'परमाणु लेखन, स्वामित्व टोकन वाला क्रॉस-प्रोसेस म्यूटेक्स, और भ्रष्टाचार क्वारंटाइन।',
		},
		f4: {
			t: 'मल्टी-एजेंट के लिए तैयार',
			b: 'proposals प्लगइन एक swarm समन्वयित करता है: लॉक, कार्य कतार, slice असंयुक्तता और पुश सूचनाएँ।',
		},
	},
	install: {
		title: 'इंस्टॉल और चलाएँ',
		lead: 'इसे जोड़ें और अपने MCP क्लाइंट को mcp-vertex बाइनरी की ओर इंगित करें:',
		verify: 'चलता है यह जाँचें',
		addto: 'अपने IDE / एजेंट में जोड़ें',
		presets: 'प्रीसेट:',
		oneCmd: 'एक कमांड · कोई भी IDE',
		oneCmdNote:
			'आपका IDE पहचानकर mcp-vertex जोड़ता है — आपके बाकी MCP सर्वर को छुए बिना।',
		config: 'एक प्रीसेट चुनें (minimal · standard · swarm) या प्लगइन स्पष्ट रूप से सूचीबद्ध करें। स्व-निदान के लिए --check के साथ चलाएँ।',
		excludeHelp:
			'--exclude-plugins= (उपनाम: --excludePlugins=) के साथ हल प्लगइन सेट से प्लगइन्स हटाएँ। प्रीसेट से किसी प्लगइन को फोर्क किए बिना हटाने के लिए उपयोगी — उदा. --preset=swarm --exclude-plugins=notification एकल-एजेंट सत्र के लिए।',
	},
	tools: {
		title: 'टूल',
		lead: 'पूर्ण प्लगइन सेट द्वारा उजागर हर टूल, namespace के अनुसार समूहित — जीवित रजिस्ट्री से लिया गया, इसलिए यह पृष्ठ कभी कोड से अलग नहीं होता।',
		count: 'टूल',
		packages: 'पैकेज',
	},
	bench: {
		title: 'मापा गया, दावा नहीं',
		lead: 'टोकन दक्षता एक संरक्षित अपरिवर्तनीय है — यदि ये सीमाएँ रिग्रेस हों तो CI टेस्ट विफल होता है।',
		b1: {
			t: 'कोल्ड-स्टार्ट',
			b: 'overview (संक्षिप्त) + auto_work — 300 टोकन से कम में पूर्ण अभिविन्यास।',
		},
		b2: {
			t: 'कोई पोलिंग नहीं',
			b: 'लॉक-रिलीज़ पुश किया जाता है (notification प्लगइन), लूप में पोल नहीं।',
		},
		b3: {
			t: 'ड्रिफ्ट-संरक्षित',
			b: 'एक जनित टाइप SDK, टोकन बजट और असली प्रोटोकॉल पर सख्त e2e जाल।',
		},
		live: {
			title: 'अभिविन्यास लागत · सीधे मापा गया',
			note: 'एजेंट जो परिणाम पाठ देखता है उसके टोकन (≈4 बाइट/टोकन), proposals+memory के साथ प्रोटोकॉल पर सीधे मापे गए। बेसलाइन हाथ से अभिविन्यास का एक उदाहरणात्मक अनुमान है — किसी तीसरे-पक्ष टूल का माप नहीं।',
		},
		baseline: 'mcp-vertex के बिना (हाथ से · अनुमान)',
	},
	plugins: {
		title: 'प्लगइन',
		lead: 'प्रकाशित पैकेज। केवल जो चाहिए वही लोड करें; कोर छोटा रहता है।',
	},
	cfg: {
		title: 'सेटिंग्स',
		theme: 'थीम',
		language: 'भाषा',
		motion: 'एनिमेशन',
		motionLabel: 'मार्की को एनिमेट करें',
	},
	footer: { built: 'जीवित टूल रजिस्ट्री से जनित।' },
	pluginpage: { back: 'वापस', tools: 'टूल', install: 'इंस्टॉल' },
	plugin: {
		proposals:
			'मल्टी-एजेंट समन्वय: लॉक, कार्य कतार, slices, round-context, स्थिति मरम्मत।',
		git: 'केवल-पढ़ने योग्य रिपॉजिटरी निरीक्षण: status, बदली फाइलें, diff, log।',
		memory: 'सत्रों के बीच टिकाऊ नोट्स, BM25 रिकॉल, कोटा, TTL और सीक्रेट रिडैक्शन के साथ।',
		search: 'कम-लागत workspace खोज: substring या regex, glob शामिल/बहिष्कृत।',
		rules: 'फ्रेमवर्क पहचान + lint/परंपरा मार्गदर्शन; प्रोजेक्ट कॉन्फ़िग प्राथमिकता।',
		quality:
			'गुणवत्ता गेट चलाएँ (lint/test/build) allow/deny नीति के साथ; रद्द करने योग्य।',
		docs: 'प्रोजेक्ट markdown दस्तावेज़ कैटलॉग करें और पढ़ें, कम-लागत क्यूरेटेड नेविगेशन।',
		deps: 'ऑफ़लाइन निर्भरता सूची + स्वास्थ्य (lockfile, ढीली रेंज, डुप्लिकेट)।',
		notification: 'लॉक-रिलीज़ इवेंट पुश करता है ताकि एजेंट पोलिंग बंद करें।',
		'status-marker':
			'हर एजेंट उत्तर के लिए अनिवार्य रंगीन क्लोज़ मार्कर: 8 कैनोनिकल स्थितियाँ, helper + validator टूल।',
		core: 'निरपेक्ष कोर: overview, scaffold, मेट्रिक्स, doctor और प्लगइन लोडर।',
	},
	knowledge: {
		title: 'Knowledge',
		lead: 'Catalogued documents the core can answer questions about.',
		count: 'documents',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Reusable prompt templates exposed by the core.',
		count: 'prompts',
		arg: 'arguments',
	},
	resources: {
		title: 'Resources',
		lead: 'Static resources bundled with the project (URI + MIME).',
		count: 'resources',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Domain playbooks the agent can load on demand.',
		count: 'skills',
		body: 'Body',
	},
	notFound: {
		code: '404',
		title: 'पृष्ठ नहीं मिला',
		lead: 'जिस पृष्ठ को आप खोज रहे हैं वह मौजूद नहीं है या स्थानांतरित हो गया है। कोर निरपेक्ष रहता है — टूटे URL के प्रति भी।',
		homeCta: 'होम पर वापस',
		toolsCta: 'टूल देखें',
		homeAria: 'होम पर जाएँ',
	},
};

export default dict;
