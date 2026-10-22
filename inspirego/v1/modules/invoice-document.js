import { formatCurrency } from "../js/currency.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const uniqueValues=values=>values.map(value=>String(value??"").trim()).filter((value,index,items)=>value&&items.findIndex(item=>item.toLowerCase()===value.toLowerCase())===index);
const qrEncoderScript=new URL("../js/vendor/qrcode.js",import.meta.url).href;
const qrUtf8Script=new URL("../js/vendor/qrcode_UTF8.js",import.meta.url).href;
const defaultCompanyLogo=new URL("../assets/logo-client.svg",import.meta.url).href;
const formatInvoiceDate=value=>{
  if(!value) return "-";
  const date=typeof value.toDate==="function"?value.toDate():new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?`${value}T00:00:00`:value);
  return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(date);
};

export function invoiceMessage({sale,customer,company}){
  const companyName=company.cmp_name||"our company";
  const customerName=customer?.name||sale.customer||"there";
  const number=sale.documentNo||sale.invoiceNumber||sale.reference||"your bill";
  const amount=formatCurrency(sale.amount,company.cmp_currency||"INR");
  const date=sale.date||sale.createdAt?.toDate?.().toLocaleDateString?.()||"";
  return `Hello ${customerName},\n\nPlease find your bill ${number}${date?` dated ${date}`:""} for ${amount} from ${companyName}.\nPayment status: ${sale.paymentStatus||"Pending"}.\n\nThank you,\n${companyName}${company.cmp_phone?`\n${company.cmp_phone}`:""}`;
}

export function createInvoiceHtml({sale,customer,company={},bank=null,template={},logoDataUrl="",autoPrint=false}){
  const currency=company.cmp_currency||"INR";
  const accent=/^#[0-9a-f]{6}$/i.test(template.accentColor||"")?template.accentColor:"#174A7E";
  const invoiceNumber=sale.documentNo||sale.invoiceNumber||sale.reference||"Pending";
  const companyName=company.cmp_name||company.cmp_legal_name||"Company name";
  const legalName=company.cmp_legal_name&&company.cmp_legal_name.trim().toLowerCase()!==companyName.trim().toLowerCase()?company.cmp_legal_name:"";
  const logoSource=companyLogoSource({cmp_logo:logoDataUrl})||companyLogoSource(company)||defaultCompanyLogo;
  const logo=template.showLogo!==false&&logoSource?`<img class="company-logo" src="${escapeHtml(logoSource)}" alt="${escapeHtml(companyName)}" onerror="this.hidden=true">`:"";
  const address=uniqueValues([company.cmp_floor,company.cmp_building_name||company.cmp_addr1,company.cmp_area||company.cmp_addr2||company.cmp_city,company.cmp_district,company.cmp_state,company.cmp_pincode||company.cmp_pin,company.cmp_country]).join(", ");
  const phoneNumbers=uniqueValues([company.cmp_phone,company.cmp_alt_phone]);
  const contactRow=(icon,value)=>value?`<p class="company-contact-row"><svg class="contact-icon" data-lucide="${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon==="map-pin"?'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>':icon==="mail"?'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>':icon==="phone"?'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.3-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.68A2 2 0 0 1 22 16.92Z"/>':'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>'}</svg><span>${escapeHtml(value)}</span></p>`:"";
  const companyDetails=[
    template.showCompanyAddress!==false?contactRow("map-pin",address):"",
    ...phoneNumbers.map(phone=>contactRow("phone",phone)),
    contactRow("mail",company.cmp_email),
    contactRow("globe",company.cmp_website),
    legalName?`<p>${escapeHtml(legalName)}</p>`:"",
    company.cmp_biz_type?`<p>${escapeHtml(company.cmp_biz_type)}</p>`:"",
    company.cmp_reg_no?`<p>Registration: ${escapeHtml(company.cmp_reg_no)}</p>`:"",
    company.cmp_pan?`<p>PAN: ${escapeHtml(company.cmp_pan)}</p>`:"",
    company.cmp_gstin?`<p>GSTIN: ${escapeHtml(company.cmp_gstin)}</p>`:"",
    company.cmp_cin?`<p>CIN / LLPIN: ${escapeHtml(company.cmp_cin)}</p>`:""
  ].filter(Boolean).join("");
  const customerAddress=uniqueValues([customer?.address,customer?.city,customer?.district,customer?.state,customer?.pin,customer?.country]).join(", ");
  const bankDetails=bank?[
    bank.bankName||bank.name?`<p><strong>Bank name</strong><span>${escapeHtml(bank.bankName||bank.name)}</span></p>`:"",
    bank.accountHolderName?`<p><strong>Account holder</strong><span>${escapeHtml(bank.accountHolderName)}</span></p>`:"",
    bank.accountNumber?`<p><strong>Account number</strong><span>${escapeHtml(bank.accountNumber)}</span></p>`:"",
    bank.ifsc?`<p><strong>Routing code</strong><span>${escapeHtml(bank.ifsc)}</span></p>`:"",
    bank.bankBranch?`<p><strong>Branch</strong><span>${escapeHtml(bank.bankBranch)}</span></p>`:""
  ].filter(Boolean).join(""):"";
  const taxUnregistered=String(company.cmp_tax_type||"").toLowerCase()==="unregistered";
  const upiId=String(company.cmp_upi_id||template.upiId||"").trim();
  const upiEnabled=template.showPaymentQr!==false&&Boolean(upiId)&&currency==="INR";
  const upiPayeeName=String(template.upiPayeeName||companyName).trim()||companyName;
  const upiPayload=upiEnabled?new URLSearchParams({
    pa:upiId,
    pn:upiPayeeName,
    am:(Number(sale.total??sale.amount??0)||0).toFixed(2),
    cu:"INR",
    tn:`Invoice ${invoiceNumber}`
  }).toString():"";
  const paymentQr=upiPayload?`<div class="payment-qr"><div class="payment-qr-code" id="invoicePaymentQr" data-payload="upi://pay?${escapeHtml(upiPayload)}" role="img" aria-label="UPI payment QR code">Preparing payment QR...</div><div class="payment-qr-copy"><h3>Scan to pay</h3><p>Scan with any UPI app. The invoice amount is prefilled.</p><p><strong>UPI ID</strong><span>${escapeHtml(upiId)}</span></p><p><strong>Payee</strong><span>${escapeHtml(upiPayeeName)}</span></p></div></div>`:"";
  const showBankDetails=template.showBankDetails!==false&&bankDetails;
  const bankSection=paymentQr||showBankDetails?`<section class="payment-section"><h2>Payment information</h2>${paymentQr}${showBankDetails?`<div class="bank-details">${bankDetails}</div>`:""}</section>`:"";
  const saleItems=Array.isArray(sale.items)&&sale.items.length?sale.items:[{description:sale.description||sale.notes||"Sales",quantity:sale.quantity??sale.qty??1,rate:sale.rate??sale.amount,amount:sale.subtotal??sale.amount}];
  const itemRows=saleItems.map(item=>{
    const quantity=Number(item.quantity)||1;
    const rate=Number(item.rate)||0;
    const amount=Number(item.amount??(quantity*rate))||0;
    return `<tr>${taxUnregistered?"":`<td class="hsn-code">${escapeHtml(item.hsnCode||"—")}</td>`}<td class="item-description">${escapeHtml(item.description||"Service")}</td><td class="numeric">${escapeHtml(quantity)}</td><td class="numeric">${escapeHtml(formatCurrency(rate,currency))}</td><td class="numeric">${escapeHtml(formatCurrency(amount,currency))}</td></tr>`;
  }).join("");
  const itemSubtotal=saleItems.reduce((total,item)=>total+(Number(item.amount)||0),0);
  const totalValue=Number(taxUnregistered?(sale.subtotal??sale.amount??sale.total):(sale.total??sale.amount))||0;
  const itemAmount=Number(sale.subtotal??itemSubtotal)||0;
  const taxValue=taxUnregistered?0:Number(sale.taxAmount)||0;
  const showBreakdown=!taxUnregistered&&(sale.subtotal!==undefined||sale.taxAmount!==undefined);
  const subtotalValue=Number(sale.subtotal??itemAmount)||0;
  const grandTotal=Number(sale.total??(subtotalValue+taxValue))||0;
  const paymentTerms=template.paymentTerms||company.cmp_terms||"Thank you for your business.";
  const footerLines=uniqueValues([paymentTerms,template.footerNote]);
  const showCompanyName=template.showCompanyName!==false;
  const layout=template.layout==="classic"?"classic":"modern";
  const saleDate=formatInvoiceDate(sale.date||sale.createdAt);
  const customerName=customer?.name||sale.customer||sale.clientName||"Customer";
  const customerDetails=[
    customer?.contactPerson?`<p>${escapeHtml(customer.contactPerson)}</p>`:"",
    customerAddress?`<p>${escapeHtml(customerAddress)}</p>`:"",
    customer?.phone?`<p>${escapeHtml(customer.phone)}</p>`:"",
    customer?.email?`<p>${escapeHtml(customer.email)}</p>`:"",
    customer?.gstin?`<p>GSTIN: ${escapeHtml(customer.gstin)}</p>`:""
  ].filter(Boolean).join("");
  const saleDetails=[
    sale.salesLedgerName?`<p><span>Sales ledger</span><strong>${escapeHtml(sale.salesLedgerName)}</strong></p>`:"",
    sale.reference&&sale.reference!==invoiceNumber?`<p><span>Reference</span><strong>${escapeHtml(sale.reference)}</strong></p>`:"",
    sale.partyType?`<p><span>Payment mode</span><strong>${escapeHtml(sale.partyType)}</strong></p>`:""
  ].filter(Boolean).join("")||`<p><span>Document</span><strong>Sales invoice</strong></p>`;
  const totals=showBreakdown
    ?`<div class="totals-row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(subtotalValue,currency))}</strong></div>${taxValue?`<div class="totals-row"><span>Tax</span><strong>${escapeHtml(formatCurrency(taxValue,currency))}</strong></div>`:""}`
    :"";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    :root{color-scheme:light;--accent:${accent};--ink:#192b3d;--muted:#637386;--line:#dfe6ed;--soft:#f3f6f9}
    *{box-sizing:border-box}
    body{margin:0;background:#edf1f5;color:var(--ink);font:13px/1.55 "Arial",sans-serif}
    .toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid var(--line)}
    .toolbar button{border:0;border-radius:7px;background:var(--accent);color:#fff;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer}
    .invoice{width:min(210mm,calc(100% - 36px));min-height:297mm;margin:24px auto;padding:17mm 16mm;background:#fff;box-shadow:0 12px 36px #182c421a}
    .invoice-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:22px;padding-bottom:22px;border-bottom:2px solid var(--accent)}
    .brand{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}
    .company-logo{display:block;width:${company.cmp_logo_ratio==="square"?"96px":"260px"};height:${company.cmp_logo_ratio==="square"?"84px":"72px"};flex:0 0 auto;object-fit:contain;object-position:left center}
    .company-details{min-width:0;color:var(--muted);font-size:10px;line-height:1.5;overflow-wrap:anywhere}
    .company-details p{margin:1px 0}
    .company-contact-row{display:flex;align-items:flex-start;gap:6px;min-width:0}
    .company-contact-row .contact-icon{width:12px;height:12px;flex:0 0 12px;margin-top:1px;color:var(--accent)}
    .company-contact-row span{min-width:0;overflow-wrap:anywhere}
    .company-name{margin:0 0 4px;color:var(--ink);font-size:15px;font-weight:700;line-height:1.25}
    .invoice-title{min-width:174px;text-align:right}
    .invoice-kicker{margin:0 0 2px;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
    .invoice-title h1{margin:0;color:var(--accent);font-size:30px;line-height:1.15;letter-spacing:.035em}
    .invoice-meta{display:grid;grid-template-columns:auto auto;justify-content:end;gap:3px 12px;margin-top:9px;font-size:10px;text-align:right}
    .invoice-meta span:nth-child(odd){color:var(--muted)}
    .invoice-meta strong{font-weight:600}
    .info-section{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.72fr);gap:28px;margin:26px 0}
    .section-label{margin:0 0 9px;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .bill-to h2,.payment-section h2{margin:0 0 5px;color:var(--ink);font-size:15px}
    .bill-to p{margin:2px 0;color:#536477;font-size:11px;overflow-wrap:anywhere}
    .bill-to .customer-name{margin-bottom:5px;color:var(--ink);font-size:13px;font-weight:700}
    .sale-details{padding:14px 16px;border:1px solid var(--line);border-radius:8px;background:var(--soft)}
    .sale-details p{display:flex;justify-content:space-between;gap:12px;margin:3px 0;font-size:10px}
    .sale-details p span{color:var(--muted)}
    .sale-details p strong{text-align:right;font-weight:600}
    .line-items{width:100%;margin:0 0 20px;border-collapse:collapse}
    .line-items thead{display:table-header-group}
    .line-items th{padding:10px 11px;background:var(--accent);color:#fff;font-size:9px;font-weight:700;letter-spacing:.045em;text-align:left;text-transform:uppercase}
    .line-items td{padding:11px;border-bottom:1px solid var(--line);color:#34485c;font-size:11px;vertical-align:top}
    .line-items tbody tr:nth-child(even){background:#fafbfd}
    .line-items th:nth-child(1),.line-items td:nth-child(1){width:${taxUnregistered?"47%":"13%"}}
    .line-items th:nth-child(2),.line-items td:nth-child(2){width:${taxUnregistered?"10%":"36%"};text-align:${taxUnregistered?"center":"left"}}
    .line-items th:nth-child(3),.line-items td:nth-child(3){width:${taxUnregistered?"21%":"10%"};text-align:${taxUnregistered?"right":"center"}}
    .line-items th:nth-child(4),.line-items td:nth-child(4){width:${taxUnregistered?"22%":"20%"}}
    .line-items th:nth-child(5),.line-items td:nth-child(5){width:21%}
    .line-items .numeric{text-align:right;white-space:nowrap}
    .line-items .item-description{width:${taxUnregistered?"47%":"36%"};overflow-wrap:anywhere}
    .totals-section{display:flex;justify-content:flex-end;margin:0 0 24px}
    .totals-box{width:min(290px,100%)}
    .totals-row{display:flex;justify-content:space-between;gap:16px;padding:5px 2px;color:var(--muted);font-size:11px}
    .totals-row strong{color:var(--ink);font-weight:600}
    .totals-row.grand-total{margin-top:7px;padding:12px 13px;border-radius:7px;background:var(--soft);color:var(--accent);font-size:13px;font-weight:700}
    .totals-row.grand-total strong{color:var(--accent);font-size:16px}
    .payment-section{margin-top:24px;padding:14px 16px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:7px}
    .payment-section h2{font-size:12px}
    .payment-qr{display:flex;align-items:center;gap:16px;margin:10px 0 14px;padding:12px;border:1px solid var(--line);border-radius:7px;background:#fff}
    .payment-qr-code{display:grid;width:128px;height:128px;flex:0 0 128px;place-items:center;padding:6px;border:1px solid var(--line);border-radius:5px;color:var(--muted);font-size:9px;text-align:center}
    .payment-qr-code svg{display:block;width:100%;height:100%}
    .payment-qr-copy h3{margin:0 0 4px;font-size:12px}
    .payment-qr-copy p{margin:3px 0;color:var(--muted);font-size:10px;overflow-wrap:anywhere}
    .payment-qr-copy p strong{color:var(--ink)}
    .bank-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}
    .bank-details p{display:grid;gap:1px;margin:0;font-size:10px;overflow-wrap:anywhere}
    .bank-details p strong{color:var(--muted);font-size:9px;font-weight:600}
    .invoice-footer{display:flex;justify-content:space-between;gap:24px;margin-top:30px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:9px}
    .invoice-footer p{margin:0;white-space:pre-line}
    .invoice-footer p:last-child{text-align:right}
    .classic .invoice-head{border-bottom-width:1px}
    .classic .sale-details{border-radius:3px;background:#fff}
    .classic .totals-row.grand-total{border:1px solid var(--accent);background:#fff}
    .auto-print .toolbar{display:none}
    @page{size:A4;margin:14mm}
    @media print{
      html,body{background:#fff!important}
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .toolbar{display:none!important}
      .invoice{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
      .line-items tr,.sale-details,.payment-section,.totals-box{break-inside:avoid}
    }
    @media(max-width:650px){
      .invoice{width:100%;min-height:0;margin:0;padding:22px}
      .invoice-head{grid-template-columns:1fr;gap:16px}
      .invoice-title{min-width:0;text-align:left}
      .invoice-meta{justify-content:start;text-align:left}
      .info-section{grid-template-columns:1fr;gap:16px;margin:20px 0}
      .invoice-footer{flex-direction:column;gap:6px}
      .invoice-footer p:last-child{text-align:left}
    }
    @media(max-width:420px){
      .invoice{padding:17px}
      .brand{gap:7px}
      .company-logo{width:${company.cmp_logo_ratio==="square"?"68px":"210px"};height:${company.cmp_logo_ratio==="square"?"64px":"58px"}}
      .invoice-title h1{font-size:26px}
      .line-items th,.line-items td{padding:8px 5px;font-size:9px}
      .bank-details{grid-template-columns:1fr}
      .payment-qr{align-items:flex-start;gap:10px;padding:8px}
      .payment-qr-code{width:92px;height:92px;flex-basis:92px}
    }
  </style>
</head>
<body class="${layout}${autoPrint?" auto-print":""}">
  <div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
  <main class="invoice">
    <header class="invoice-head">
      <div class="brand">${logo}<div class="company-details">${showCompanyName?`<h2 class="company-name">${escapeHtml(companyName)}</h2>`:""}${companyDetails}</div></div>
      <div class="invoice-title"><p class="invoice-kicker">Sales document</p><h1>INVOICE</h1><div class="invoice-meta"><span>Invoice no.</span><strong>${escapeHtml(invoiceNumber)}</strong><span>Date</span><strong>${escapeHtml(saleDate)}</strong></div></div>
    </header>
    <section class="info-section">
      <div class="bill-to"><p class="section-label">Bill to</p><h2 class="customer-name">${escapeHtml(customerName)}</h2>${customerDetails}</div>
      <div class="sale-details"><p class="section-label">Transaction details</p>${saleDetails}</div>
    </section>
    <table class="line-items">
      <thead><tr>${taxUnregistered?"":'<th>HSN</th>'}<th>Description</th><th>Qty</th><th class="numeric">Rate (${escapeHtml(currency)})</th><th class="numeric">Amount (${escapeHtml(currency)})</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <section class="totals-section"><div class="totals-box">${totals}<div class="totals-row grand-total"><span>Grand total</span><strong>${escapeHtml(formatCurrency(totalValue||grandTotal,currency))}</strong></div></div></section>
    ${bankSection}
    <footer class="invoice-footer"><p>${footerLines.map(escapeHtml).join("\n")}</p><p>${escapeHtml(companyName)}${company.cmp_gstin?` · GSTIN ${escapeHtml(company.cmp_gstin)}`:""}</p></footer>
  </main>
  ${upiPayload?`<script src="${escapeHtml(qrEncoderScript)}" defer></script><script src="${escapeHtml(qrUtf8Script)}" defer></script>`:""}
  ${upiPayload||autoPrint?`<script>window.addEventListener("load",()=>{const target=document.getElementById("invoicePaymentQr");if(target){if(typeof qrcode==="function"){try{const code=qrcode(0,"M");code.addData(target.dataset.payload);code.make();target.innerHTML=code.createSvgTag(4,0);target.querySelector("svg")?.setAttribute("aria-label","UPI payment QR code");}catch(error){console.error("Could not render the invoice payment QR.",error);target.textContent="Could not generate QR. Use the bank details below.";}}else{target.textContent="QR unavailable. Use the bank details below.";}}${autoPrint?"window.setTimeout(()=>window.print(),target?250:100);":""}},{once:true});</script>`:""}
</body>
</html>`;
}

export function companyLogoSource(company){
  const source=company.cmp_logo||"";
  return /^(https?:|data:image\/|blob:)/i.test(source)?source:"";
}
