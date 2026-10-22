import { getCompany, getCompanyLogoBlob, listRecords, saveCompany } from "../js/firebase-service.js?v=11";
import { createInvoiceHtml, companyLogoSource } from "./invoice-document.js?v=6";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const defaults={name:"Sales invoice",layout:"modern",accentColor:"#174A7E",billingBankId:"",showLogo:true,showBankDetails:true,showPaymentQr:true,upiId:"",upiPayeeName:"",showCompanyName:true,showCompanyAddress:true,paymentTerms:"Payment is due as agreed.",footerNote:"Thank you for your business."};

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function init(){
  const root=document.querySelector("#moduleContainer .invoice-template-page");
  if(!root) return;
  const [companyResult,ledgerResult]=await Promise.allSettled([getCompany(),listRecords("ledger")]);
  if(companyResult.status==="rejected"){
    root.innerHTML=`<div class="empty invoice-template-error"><span class="material-symbols-rounded">cloud_off</span><p>Could not load Company Profile. Invoice settings were not changed.</p><small>${escapeHtml(companyResult.reason?.message||"Check Firebase configuration and access rules.")}</small></div>`;
    return;
  }
  const company=companyResult.value||{};
  const banks=ledgerResult.status==="fulfilled"
    ?ledgerResult.value.filter(ledger=>ledger.accountType==="Bank"||ledger.systemDefaultKey==="bank")
    :[];
  const settings={...defaults,...(company.invoiceTemplate||{})};
  if(!settings.billingBankId&&banks.length===1) settings.billingBankId=banks[0].id;
  root.innerHTML=`<div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">receipt_long</span></div><div><h1>Invoice Template</h1><p>Set the design, company details, bank account, and terms used on sales invoices.</p></div></div></div>
    <div class="invoice-template-layout">
      <form class="invoice-template-settings" id="invoiceTemplateForm">
        <div><p class="invoice-template-eyebrow">SALES DOCUMENT</p><h2>Template settings</h2></div>
        <div class="form-group"><label for="invoiceTemplateName">Template name</label><input class="form-control" id="invoiceTemplateName" maxlength="70" required></div>
        <div class="form-group"><label for="invoiceTemplateLayout">Style</label><select class="form-control" id="invoiceTemplateLayout"><option value="classic">Classic</option><option value="modern">Modern</option></select></div>
        <div class="form-group"><label for="invoiceTemplateColor">Accent colour</label><div class="invoice-template-color"><input id="invoiceTemplateColor" type="color" aria-label="Invoice accent colour"><span id="invoiceTemplateColorValue"></span></div></div>
        <div class="invoice-template-options">
          <label class="invoice-template-toggle"><input id="invoiceTemplateShowLogo" type="checkbox"><span>Show horizontal company logo</span></label>
          <label class="invoice-template-toggle"><input id="invoiceTemplateShowName" type="checkbox"><span>Show company name</span></label>
          <label class="invoice-template-toggle"><input id="invoiceTemplateShowAddress" type="checkbox"><span>Show company address</span></label>
          <label class="invoice-template-toggle"><input id="invoiceTemplateShowBank" type="checkbox"><span>Show bank details</span></label>
          <label class="invoice-template-toggle"><input id="invoiceTemplateShowQr" type="checkbox"><span>Show UPI payment QR</span></label>
        </div>
        <div class="form-group"><label for="invoiceTemplateUpiId">UPI ID</label><input class="form-control" id="invoiceTemplateUpiId" type="text" autocomplete="off" placeholder="business@bank" maxlength="255" pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,254}@[A-Za-z0-9.-]{2,63}"><small class="invoice-template-help">Linked to Company Profile. The QR is generated locally and prefilled with each invoice total. UPI QR payments use INR.</small></div>
        <div class="form-group"><label for="invoiceTemplateUpiPayee">UPI payee name</label><input class="form-control" id="invoiceTemplateUpiPayee" type="text" maxlength="70"></div>
        <div class="form-group"><label for="invoiceBillingBank">Invoice bank account</label><select class="form-control" id="invoiceBillingBank"><option value="">Select bank account</option>${banks.map(bank=>`<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.bankName||bank.name||"Bank account")}${bank.accountNumber?` ···${escapeHtml(String(bank.accountNumber).slice(-4))}`:""}</option>`).join("")}</select><small class="invoice-template-help">Bank information is linked directly from Ledger.</small></div>
        <div class="form-group"><label for="invoiceTemplateTerms">Invoice terms</label><textarea class="form-control" id="invoiceTemplateTerms" rows="3" maxlength="1200"></textarea></div>
        <div class="form-group"><label for="invoiceTemplateFooter">Footer note</label><textarea class="form-control" id="invoiceTemplateFooter" rows="2" maxlength="500"></textarea></div>
        <p class="invoice-template-company">Company name and address are linked from Company Profile. Update them there; these options control whether they appear on the invoice.</p>
        <p class="invoice-template-feedback" id="invoiceTemplateFeedback" role="status" hidden></p>
        <button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">save</span><span>Save template</span></button>
      </form>
      <section class="invoice-template-preview"><div class="invoice-template-preview-header"><div><p class="invoice-template-eyebrow">LIVE PREVIEW</p><h2>Sales invoice</h2></div><span>A4 · Print-ready</span></div><iframe title="Sales invoice template preview" id="invoiceTemplatePreview"></iframe></section>
    </div>`;

  const el=id=>document.getElementById(id);
  el("invoiceTemplateName").value=settings.name;
  el("invoiceTemplateLayout").value=settings.layout;
  el("invoiceTemplateColor").value=/^#[0-9a-f]{6}$/i.test(settings.accentColor)?settings.accentColor:defaults.accentColor;
  el("invoiceTemplateShowLogo").checked=settings.showLogo!==false;
  el("invoiceTemplateShowName").checked=settings.showCompanyName!==false;
  el("invoiceTemplateShowAddress").checked=settings.showCompanyAddress!==false;
  el("invoiceTemplateShowBank").checked=settings.showBankDetails!==false;
  el("invoiceTemplateShowQr").checked=settings.showPaymentQr!==false;
  el("invoiceTemplateUpiId").value=company.cmp_upi_id||settings.upiId||"";
  el("invoiceTemplateUpiPayee").value=settings.upiPayeeName||company.cmp_name||"";
  el("invoiceBillingBank").value=settings.billingBankId||"";
  el("invoiceTemplateTerms").value=settings.paymentTerms||"";
  el("invoiceTemplateFooter").value=settings.footerNote||"";

  function getSettings(){
    return{
      ...settings,
      name:el("invoiceTemplateName").value.trim(),
      layout:el("invoiceTemplateLayout").value,
      accentColor:el("invoiceTemplateColor").value,
      showLogo:el("invoiceTemplateShowLogo").checked,
      showCompanyName:el("invoiceTemplateShowName").checked,
      showCompanyAddress:el("invoiceTemplateShowAddress").checked,
      showBankDetails:el("invoiceTemplateShowBank").checked,
      showPaymentQr:el("invoiceTemplateShowQr").checked,
      upiId:el("invoiceTemplateUpiId").value.trim(),
      upiPayeeName:el("invoiceTemplateUpiPayee").value.trim(),
      billingBankId:el("invoiceBillingBank").value,
      paymentTerms:el("invoiceTemplateTerms").value.trim(),
      footerNote:el("invoiceTemplateFooter").value.trim()
    };
  }

  function refreshPreview(){
    const selectedSettings=getSettings();
    el("invoiceTemplateColorValue").textContent=selectedSettings.accentColor.toUpperCase();
    const sample={documentNo:"SAL-00001",reference:"BOOKING-001",date:new Date().toISOString().slice(0,10),amount:1770,subtotal:1500,taxAmount:270,total:1770,partyType:"Bank",salesLedgerName:"Sales",items:[{description:"Sample product",itemType:"Product",hsnCode:"84713010",quantity:2,rate:750,taxRate:18,amount:1500}]};
    const bank=banks.find(item=>item.id===selectedSettings.billingBankId)||null;
    el("invoiceTemplatePreview").srcdoc=createInvoiceHtml({sale:sample,customer:{name:"Sample Customer",email:"customer@example.com",phone:"+91 90000 00000"},company:{...company,cmp_upi_id:selectedSettings.upiId},bank,template:selectedSettings,logoDataUrl,autoPrint:false});
  }

  function syncPaymentQrFields(){
    const enabled=el("invoiceTemplateShowQr").checked;
    el("invoiceTemplateUpiId").required=enabled;
    el("invoiceTemplateUpiId").closest(".form-group").hidden=!enabled;
    el("invoiceTemplateUpiPayee").closest(".form-group").hidden=!enabled;
  }

  let logoDataUrl=companyLogoSource(company);
  if(company.cmp_logo&&!logoDataUrl){
    try{logoDataUrl=await blobToDataUrl(await getCompanyLogoBlob(company.cmp_logo));}
    catch(error){
      console.error("Could not load company logo for invoice preview.",error);
      el("invoiceTemplateFeedback").textContent="Could not load the company logo for preview. Sales invoices will try to load it when generated.";
      el("invoiceTemplateFeedback").hidden=false;
    }
  }
  syncPaymentQrFields();
  el("invoiceTemplateShowQr").addEventListener("change",()=>{syncPaymentQrFields();refreshPreview();});

  ["invoiceTemplateName","invoiceTemplateLayout","invoiceTemplateColor","invoiceTemplateShowLogo","invoiceTemplateShowName","invoiceTemplateShowAddress","invoiceTemplateShowBank","invoiceTemplateUpiId","invoiceTemplateUpiPayee","invoiceBillingBank","invoiceTemplateTerms","invoiceTemplateFooter"].forEach(id=>{
    el(id).addEventListener("input",refreshPreview);
    el(id).addEventListener("change",refreshPreview);
  });
  if(ledgerResult.status==="rejected"){
    el("invoiceTemplateFeedback").textContent=`Could not load Ledger bank accounts: ${ledgerResult.reason?.message||"Check Firebase configuration and access rules."}`;
    el("invoiceTemplateFeedback").hidden=false;
  }

  el("invoiceTemplateForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=el("invoiceTemplateForm");
    const submit=form.querySelector('[type="submit"]');
    const feedback=el("invoiceTemplateFeedback");
    const nextSettings=getSettings();
    if(nextSettings.showPaymentQr){
      if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}@[A-Za-z0-9.-]{2,63}$/.test(nextSettings.upiId)){
        feedback.textContent="Enter a valid UPI ID or turn off Show UPI payment QR.";
        feedback.hidden=false;
        el("invoiceTemplateUpiId").focus();
        return;
      }
      if((company.cmp_currency||"INR")!=="INR"){
        feedback.textContent="UPI payment QR supports INR invoices only. Set the company currency to INR or turn off Show UPI payment QR.";
        feedback.hidden=false;
        el("invoiceTemplateShowQr").focus();
        return;
      }
    }
    if(nextSettings.showBankDetails&&!nextSettings.billingBankId){
      feedback.textContent=banks.length?"Choose an invoice bank account or turn off Show bank details.":"Add a bank account in Ledger or turn off Show bank details.";
      feedback.hidden=false;
      el("invoiceBillingBank").focus();
      return;
    }
    submit.disabled=true;
    feedback.hidden=true;
    try{
      const next={...company,cmp_upi_id:nextSettings.upiId,invoiceTemplate:nextSettings};
      await saveCompany(next);
      Object.assign(company,next);
      Object.assign(settings,nextSettings);
      feedback.textContent="Invoice template saved.";
      feedback.hidden=false;
      window.showToast?.("Invoice template saved.");
    }catch(error){
      feedback.textContent=error.message||"Could not save invoice template.";
      feedback.hidden=false;
    }finally{submit.disabled=false;}
  });
  refreshPreview();
}
