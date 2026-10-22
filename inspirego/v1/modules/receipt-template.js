import { getCompany, getCompanyLogoBlob, saveCompany } from "../js/firebase-service.js?v=12";
import { companyLogoSource } from "./invoice-document.js?v=6";
import { createTransactionReceiptHtml } from "./transaction-receipt.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const defaults={name:"Receipt Voucher",accentColor:"#174A7E",showLogo:true,showCompanyName:true,showCompanyAddress:true,footerNote:"Thank you."};

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function init(){
  const root=document.querySelector("#moduleContainer .receipt-template-page");
  if(!root) return;
  let company;
  try{
    company=await getCompany()||{};
  }catch(error){
    root.innerHTML=`<div class="empty receipt-template-error"><span class="material-symbols-rounded">cloud_off</span><p>Could not load Company Profile. Receipt template settings were not changed.</p><small>${escapeHtml(error.message||"Check Firebase configuration and access rules.")}</small></div>`;
    return;
  }
  const settings={...defaults,...(company.receiptTemplate||{})};
  root.innerHTML=`<div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">receipt_long</span></div><div><h1>Receipt Voucher Template</h1><p>Set the logo, company details, and style for receipt vouchers.</p></div></div></div>
    <div class="receipt-template-layout">
      <form class="receipt-template-settings" id="receiptTemplateForm">
        <div><p class="receipt-template-eyebrow">RECEIPT DOCUMENT</p><h2>Template Settings</h2></div>
        <div class="form-group"><label for="receiptTemplateName">Template Name</label><input class="form-control" id="receiptTemplateName" maxlength="70" required></div>
        <div class="form-group"><label for="receiptTemplateColor">Accent Colour</label><div class="receipt-template-color"><input id="receiptTemplateColor" type="color" aria-label="Receipt accent colour"><span id="receiptTemplateColorValue"></span></div></div>
        <div class="receipt-template-options">
          <label class="receipt-template-toggle"><input id="receiptTemplateShowLogo" type="checkbox"><span>Show Company Logo</span></label>
          <label class="receipt-template-toggle"><input id="receiptTemplateShowName" type="checkbox"><span>Show Company Name</span></label>
          <label class="receipt-template-toggle"><input id="receiptTemplateShowAddress" type="checkbox"><span>Show Company Address</span></label>
        </div>
        <div class="form-group"><label for="receiptTemplateFooter">Footer Note</label><textarea class="form-control" id="receiptTemplateFooter" rows="3" maxlength="500"></textarea></div>
        <p class="receipt-template-feedback" id="receiptTemplateFeedback" role="status" hidden></p>
        <button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">save</span><span>Save Template</span></button>
      </form>
      <section class="receipt-template-preview"><div class="receipt-template-preview-header"><div><p class="receipt-template-eyebrow">LIVE PREVIEW</p><h2>Receipt Voucher</h2></div><span>A4 · Print-Ready</span></div><iframe title="Receipt voucher template preview" id="receiptTemplatePreview"></iframe></section>
    </div>`;

  const el=id=>document.getElementById(id);
  el("receiptTemplateName").value=settings.name;
  el("receiptTemplateColor").value=/^#[0-9a-f]{6}$/i.test(settings.accentColor)?settings.accentColor:defaults.accentColor;
  el("receiptTemplateShowLogo").checked=settings.showLogo!==false;
  el("receiptTemplateShowName").checked=settings.showCompanyName!==false;
  el("receiptTemplateShowAddress").checked=settings.showCompanyAddress!==false;
  el("receiptTemplateFooter").value=settings.footerNote||"";

  let logoDataUrl=companyLogoSource(company);
  if(company.cmp_logo&&!logoDataUrl){
    try{
      logoDataUrl=await blobToDataUrl(await getCompanyLogoBlob(company.cmp_logo));
    }catch(error){
      console.error("Could not load company logo for receipt template preview.",error);
      el("receiptTemplateFeedback").textContent="Could not load the company logo for preview. Check the Company Profile logo and Storage access.";
      el("receiptTemplateFeedback").hidden=false;
    }
  }

  function getSettings(){
    return{
      ...settings,
      name:el("receiptTemplateName").value.trim(),
      accentColor:el("receiptTemplateColor").value,
      showLogo:el("receiptTemplateShowLogo").checked,
      showCompanyName:el("receiptTemplateShowName").checked,
      showCompanyAddress:el("receiptTemplateShowAddress").checked,
      footerNote:el("receiptTemplateFooter").value.trim()
    };
  }

  function refreshPreview(){
    const selected=getSettings();
    el("receiptTemplateColorValue").textContent=selected.accentColor.toUpperCase();
    el("receiptTemplatePreview").srcdoc=createTransactionReceiptHtml({
      transaction:{type:"Receipt",documentNo:"TRN-00001",date:new Date().toISOString().slice(0,10),party:"Sample Ledger",amount:1250,reference:"REF-001",notes:"Sample receipt narration."},
      company,
      paymentMode:"Cash",
      logoDataUrl,
      template:selected,
      autoPrint:false
    });
  }

  ["receiptTemplateName","receiptTemplateColor","receiptTemplateShowLogo","receiptTemplateShowName","receiptTemplateShowAddress","receiptTemplateFooter"].forEach(id=>{
    el(id).addEventListener("input",refreshPreview);
    el(id).addEventListener("change",refreshPreview);
  });
  el("receiptTemplateForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const next=getSettings();
    const submit=el("receiptTemplateForm").querySelector('[type="submit"]');
    const feedback=el("receiptTemplateFeedback");
    submit.disabled=true;
    feedback.hidden=true;
    try{
      const updated={...company,receiptTemplate:next};
      await saveCompany(updated);
      Object.assign(company,updated);
      Object.assign(settings,next);
      feedback.textContent="Receipt voucher template saved.";
      feedback.hidden=false;
      window.showToast?.("Receipt voucher template saved.");
    }catch(error){
      feedback.textContent=error.message||"Could not save the receipt voucher template.";
      feedback.hidden=false;
    }finally{submit.disabled=false;}
  });
  refreshPreview();
}
