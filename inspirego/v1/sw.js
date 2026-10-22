const CACHE="corebiq-shell-v74";
const SHARED_STYLE_MODULES=["contra","journal","estimate","sales-return","purchase-return","payment","receipt"];
const CORE=[
	"./",
	"./index.html",
	"./login.html",
	"./license.html",
	"./manifest.json",
	"./css/corebiq.css",
	"./css/pwa.css",
	"./css/login.css",
	"./css/license.css",
	"./js/app.js",
	"./js/login.js",
	"./js/license.js",
	"./js/crud-module.js",
	"./js/currency.js",
	"./js/firebase-config.js",
	"./js/firebase-service.js",
	"./modules/invoice-document.js",
	"./modules/transaction-receipt.js",
	"./js/vendor/qrcode.js",
	"./js/vendor/qrcode_UTF8.js",
	"./assets/logo-client.svg",
	"./assets/logo.png",
	"./assets/app-icon.png",
	"./assets/favicon.png",
	"./assets/name.svg",
	...[
		"assistant","branches","cheques","clients","suppliers","company","contra","dashboard","estimate","expenses","invoice-template","receipt-template","invoices","journal","payment","purchase-return","receipt","sales-return","product-categories","service-categories",
		"payments","products","purchases","qr","reports","sales","services",
		"settings","staff","transactions","ledger"
	].flatMap(moduleName=>[
		`./modules/${moduleName}.html`,
		`./modules/${moduleName}.js`,
		...(SHARED_STYLE_MODULES.includes(moduleName)?[]:[`./modules/${moduleName}.css`])
	])
];
CORE.push("./modules/accounting-vouchers.js","./modules/accounting-vouchers.css");

self.addEventListener("install",event=>{
	event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
	self.skipWaiting();
});

self.addEventListener("activate",event=>{
	event.waitUntil(caches.keys().then(keys=>Promise.all(
		keys.filter(key=>key.startsWith("corebiq-") && key!==CACHE).map(key=>caches.delete(key))
	)));
	self.clients.claim();
});

self.addEventListener("fetch",event=>{
	if(event.request.method!=="GET") return;
	event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(response=>response||fetch(event.request)));
});
