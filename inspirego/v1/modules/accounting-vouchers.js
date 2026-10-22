import {
  convertEstimateToSale, deleteAccountingVoucher, deleteRecord, getCompany, listRecords,
  saveAccountingVoucher, saveEstimate, saveReturnRecord
} from "../js/firebase-service.js?v=13";
import { formatCurrency } from "../js/currency.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
const today=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const configs={
  contra:{title:"Contra",icon:"swap_horiz",collection:"contra_vouchers",prefix:"Contra",description:"Transfer funds between Cash and Bank accounts.",kind:"ledger"},
  journal:{title:"Journal",icon:"menu_book",collection:"journal_vouchers",prefix:"Journal",description:"Record balanced entries between two ledger accounts.",kind:"ledger"},
  estimate:{title:"Estimate",icon:"request_quote",collection:"estimates",prefix:"Estimate",description:"Create estimates without posting stock or ledger entries.",kind:"estimate"},
  "sales-return":{title:"Sales Return",icon:"assignment_return",collection:"sales_returns",prefix:"Sales Return",description:"Return goods against an original sale and reverse its accounting impact.",kind:"return",source:"sales"},
  "purchase-return":{title:"Purchase Return",icon:"keyboard_return",collection:"purchase_returns",prefix:"Purchase Return",description:"Return goods against an original purchase and reverse its accounting impact.",kind:"return",source:"purchases"}
};

export async function initAccountingVoucher(type){
  const config=configs[type];
  const root=document.querySelector("#moduleContainer .accounting-voucher-page");
  if(!config||!root) return;
  const feedbackMessage=message=>{feedback.textContent=message;feedback.hidden=!message;};
  root.innerHTML=`<div class="module-page accounting-voucher-page${type==="contra"?" contra-voucher-page":type==="journal"?" journal-voucher-page":""}"><header class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">${config.icon}</span></div><div><h1>${config.title}</h1><p>${config.description}</p></div></div><div class="actions"><button class="btn btn-outline" id="voucherRefresh" type="button">Refresh</button><button class="btn btn-primary" id="voucherCreate" type="button"><span class="material-symbols-rounded">add</span>New ${config.prefix}</button></div></header><div class="card card-pad"><div class="crud-toolbar"><input class="input-search" id="voucherSearch" type="search" placeholder="Search ${config.title.toLowerCase()}..." aria-label="Search ${config.title}"><p class="crud-feedback" id="voucherFeedback" role="status" hidden></p></div><div class="table-wrap"><table class="data-table"><thead id="voucherHead"></thead><tbody id="voucherRows"></tbody></table></div></div><dialog class="crud-dialog accounting-voucher-dialog" id="voucherDialog"><form id="voucherForm"><div class="crud-dialog-header"><h2 id="voucherTitle"></h2><button class="icon-button" id="voucherClose" type="button" aria-label="Close">×</button></div><div id="voucherFields"></div><p class="crud-feedback" id="voucherFormFeedback" role="status" hidden></p><div class="form-actions"><button class="btn btn-outline" id="voucherCancel" type="button">Cancel</button><button class="btn btn-primary" id="voucherSave" type="submit">Save</button></div></form></dialog></div>`;
  const el=id=>document.getElementById(id);
  const feedback=el("voucherFeedback"),formFeedback=el("voucherFormFeedback"),dialog=el("voucherDialog"),form=el("voucherForm");
  let records=[],ledgers=[],clients=[],products=[],services=[],sources=[];
  let currency="INR";
  const options=(items,selected="")=>items.map(item=>`<option value="${escapeHtml(item.id)}"${item.id===selected?" selected":""}>${escapeHtml(item.name||item.documentNo||item.id)}</option>`).join("");
  const select=(name,label,items,selected="")=>`<div class="form-group"><label>${label}</label><select class="form-control" name="${name}" required><option value="">Select ${label.toLowerCase()}</option>${options(items,selected)}</select></div>`;
  const field=(name,label,value="",type="text",required=false)=>`<div class="form-group"><label>${label}</label><input class="form-control" name="${name}" type="${type}" value="${escapeHtml(value)}"${required?" required":""}${type==="number"?` min="${name==="amount"?"0.01":"0"}" step="any"`:""}></div>`;
  const ledgerSide=(record,side)=>{
    const entry=record?.entries?.find(item=>side==="in"?Number(item.debit)>0:Number(item.credit)>0);
    return side==="in"?record?.ledgerInId||entry?.accountId||"":record?.ledgerOutId||entry?.accountId||"";
  };
  const voucherAmount=record=>record?.amount??record?.entries?.find(item=>Number(item.debit)>0)?.debit??record?.debitTotal??"";
  const journalCanUseTwoLedgers=record=>{
    const entries=record?.entries||[];
    const debit=entries.filter(entry=>Number(entry.debit)>0);
    const credit=entries.filter(entry=>Number(entry.credit)>0);
    return entries.length===2&&debit.length===1&&credit.length===1&&
      debit[0].accountId!==credit[0].accountId&&
      Math.abs(Number(debit[0].debit)-Number(credit[0].credit))<0.005;
  };
  const cashBankLedgers=()=>ledgers.filter(item=>["cash","bank"].includes(String(item.systemDefaultKey||item.accountType||"").toLowerCase()));

  function formMarkup(record){
    let base=`<div class="form-grid">${field("date","Date",record?.date||today(),"date",true)}${field("reference","Reference",record?.reference||"")}${field("narration","Narration",record?.narration||"")}</div>`;
    if(type==="contra"){
      const amount=voucherAmount(record);
      base=`<div class="contra-form-grid">
        <div class="form-group"><label for="contraId">Contra ID</label><input class="form-control" id="contraId" value="${escapeHtml(record?.documentNo||"Assigned on save")}" readonly></div>
        ${field("date","Date",record?.date||today(),"date",true)}
        ${select("ledgerInId","Ledger in",cashBankLedgers(),ledgerSide(record,"in"))}
        ${select("ledgerOutId","Ledger out",cashBankLedgers(),ledgerSide(record,"out"))}
        ${field("amount",`Amount (${currency})`,amount,"number",true)}
        ${field("reference","Ref No",record?.reference||"")}
        <div class="form-group contra-narration"><label for="contraNarration">Narration</label><textarea class="form-control" id="contraNarration" name="narration" rows="3">${escapeHtml(record?.narration||"")}</textarea></div>
      </div>`;
    }else if(type==="journal"){
      base=`<div class="contra-form-grid journal-form-grid">
        <div class="form-group"><label for="journalId">Journal ID</label><input class="form-control" id="journalId" value="${escapeHtml(record?.documentNo||"Assigned on save")}" readonly></div>
        ${field("date","Date",record?.date||today(),"date",true)}
        ${select("ledgerInId","Ledger in",ledgers,ledgerSide(record,"in"))}
        ${select("ledgerOutId","Ledger out",ledgers,ledgerSide(record,"out"))}
        ${field("amount",`Amount (${currency})`,voucherAmount(record),"number",true)}
        <div class="form-group contra-narration"><label for="journalNarration">Narration</label><textarea class="form-control" id="journalNarration" name="narration" rows="3">${escapeHtml(record?.narration||"")}</textarea></div>
      </div>`;
    }else if(config.kind==="ledger"){
      base+=`<div class="voucher-line-list" id="voucherLineList"></div><button class="btn btn-outline" id="voucherAddLine" type="button">Add ledger line</button><div class="voucher-totals" id="voucherTotals"></div>`;
    }else if(config.kind==="estimate"){
      base=`<div class="form-grid">${field("date","Date",record?.date||today(),"date",true)}${select("clientId","Client",clients,record?.clientId)}${select("salesLedgerId","Sales / Income ledger",ledgers.filter(item=>["income","sales"].includes(String(item.category||"").toLowerCase())||String(item.name||"").toLowerCase().includes("sales")),record?.salesLedgerId)}${field("reference","Reference",record?.reference||"")}${field("narration","Notes",record?.notes||"")}</div><div class="voucher-line-list" id="voucherLineList"></div><button class="btn btn-outline" id="voucherAddLine" type="button">Add estimate item</button><div class="voucher-totals" id="voucherTotals"></div>`;
    }else{
      base=`<div class="form-grid">${field("date","Return date",record?.date||today(),"date",true)}${select("originalId",config.source==="sales"?"Original sale":"Original purchase",sources,record?.originalId)}${field("reference","Return reference",record?.reference||"")}${field("narration","Notes",record?.narration||"")}</div><div class="voucher-line-list" id="voucherLineList"></div><button class="btn btn-outline" id="voucherAddLine" type="button">Add return item</button><div class="voucher-totals" id="voucherTotals"></div>`;
    }
    return base;
  }
  function ledgerLine(record={}){
    return `<div class="voucher-line voucher-ledger-line"><select class="form-control line-ledger" aria-label="Ledger"><option value="">Select ledger</option>${options(ledgers,record.accountId)}</select><input class="form-control line-debit" type="number" min="0" step="any" placeholder="Debit (${currency})" value="${escapeHtml(record.debit||"")}"><input class="form-control line-credit" type="number" min="0" step="any" placeholder="Credit (${currency})" value="${escapeHtml(record.credit||"")}"><input class="form-control line-narration" placeholder="Line narration" value="${escapeHtml(record.narration||"")}"><button class="icon-button line-remove" type="button" aria-label="Remove line">×</button></div>`;
  }
  function itemLine(record={},returnMode=false){
    const source=returnMode?sources.find(item=>item.id===form.elements.originalId.value):null;
    const originalItems=source?.items||[];
    const itemPool=returnMode?originalItems:(record.itemType==="Product"?products:services);
    const type=record.itemType||"Product";
    const choices=returnMode?originalItems.filter(item=>item.itemType===type).map(item=>({id:item.itemId,name:item.description||item.itemId})):itemPool;
    return `<div class="voucher-line voucher-item-line"><select class="form-control line-item-type" aria-label="Item type"><option${type==="Product"?" selected":""}>Product</option><option${type==="Service"?" selected":""}>Service</option></select><select class="form-control line-item-select" aria-label="Product or service"><option value="">Select item</option>${options(choices,record.itemId)}</select><input class="form-control line-quantity" type="number" min="0.01" step="any" value="${escapeHtml(record.quantity??1)}" aria-label="Quantity"><input class="form-control line-rate" type="number" min="0" step="any" value="${escapeHtml(record.rate??"")}" aria-label="Rate (${currency})"${returnMode?" readonly":""}><strong class="line-amount">--</strong><button class="icon-button line-remove" type="button" aria-label="Remove line">×</button></div>`;
  }
  function addLine(record={}){
    const list=el("voucherLineList");
    if(config.kind==="ledger") list.insertAdjacentHTML("beforeend",ledgerLine(record));
    else{
      const source=sources.find(item=>item.id===form.elements.originalId?.value);
      const lineRecord=config.kind==="return"&&!record.itemType?{...record,itemType:source?.items?.[0]?.itemType||"Product"}:record;
      list.insertAdjacentHTML("beforeend",itemLine(lineRecord,config.kind==="return"));
    }
    const row=list.lastElementChild;
    row.querySelector(".line-remove").addEventListener("click",()=>{row.remove();calculateTotals();});
    if(config.kind==="ledger"){
      row.querySelectorAll("input,select").forEach(input=>input.addEventListener("input",calculateTotals));
      row.querySelectorAll("select").forEach(input=>input.addEventListener("change",calculateTotals));
    }else{
      const typeSelect=row.querySelector(".line-item-type"),itemSelect=row.querySelector(".line-item-select"),rateInput=row.querySelector(".line-rate");
      if(config.kind!=="ledger") typeSelect.addEventListener("change",()=>refreshItemOptions(row));
      itemSelect.addEventListener("change",()=>{
        if(config.kind==="estimate"){
          const selected=(typeSelect.value==="Product"?products:services).find(item=>item.id===itemSelect.value);
          rateInput.value=selected?.price||"";
        }else if(config.kind==="return"){
          const source=sources.find(item=>item.id===form.elements.originalId.value);
          const selected=(source?.items||[]).find(item=>item.itemId===itemSelect.value&&item.itemType===typeSelect.value);
          rateInput.value=selected?.rate||0;
        }
        calculateTotals();
      });
      row.querySelectorAll("input").forEach(input=>input.addEventListener("input",calculateTotals));
    }
    calculateTotals();
  }
  function refreshItemOptions(row){
    const type=row.querySelector(".line-item-type").value;
    const itemSelect=row.querySelector(".line-item-select");
    const selected=config.kind==="return"
      ?(sources.find(item=>item.id===form.elements.originalId.value)?.items||[]).filter(item=>item.itemType===type).map(item=>({id:item.itemId,name:item.description||item.itemId}))
      :(type==="Product"?products:services);
    itemSelect.innerHTML=`<option value="">Select item</option>${options(selected)}`;
    row.querySelector(".line-rate").value="";
    calculateTotals();
  }
  function calculateTotals(){
    const list=el("voucherLineList");
    if(!list)return;
    if(config.kind==="ledger"){
      let debit=0,credit=0;
      list.querySelectorAll(".voucher-ledger-line").forEach(row=>{debit+=Number(row.querySelector(".line-debit").value)||0;credit+=Number(row.querySelector(".line-credit").value)||0;});
      el("voucherTotals").textContent=`Debit ${formatCurrency(debit,currency)} · Credit ${formatCurrency(credit,currency)}`;
      return;
    }
    let subtotal=0,tax=0;
    list.querySelectorAll(".voucher-item-line").forEach(row=>{
      const type=row.querySelector(".line-item-type").value;
      const itemId=row.querySelector(".line-item-select").value;
      const original=config.kind==="return"?sources.find(item=>item.id===form.elements.originalId.value)?.items?.find(item=>item.itemId===itemId&&item.itemType===type):null;
      const inventory=config.kind==="return"?original:(type==="Product"?products:services).find(item=>item.id===itemId);
      if(config.kind==="return"&&inventory) row.querySelector(".line-rate").value=inventory.rate||0;
      const amount=Number(((Number(row.querySelector(".line-quantity").value)||0)*(Number(row.querySelector(".line-rate").value)||0)).toFixed(2));
      const taxRate=Number(inventory?.taxRate)||0;
      const lineTax=Number((amount*taxRate/100).toFixed(2));
      subtotal+=amount;tax+=lineTax;
      row.querySelector(".line-amount").textContent=formatCurrency(amount+lineTax,currency);
    });
    el("voucherTotals").textContent=`Subtotal ${formatCurrency(subtotal,currency)} · Tax ${formatCurrency(tax,currency)} · Total ${formatCurrency(subtotal+tax,currency)}`;
  }
  function renderRows(){
    const query=el("voucherSearch").value.trim().toLowerCase();
    const visible=records.filter(record=>{
      const values=[record.documentNo,record.reference,record.narration,record.notes,record.partyName,record.originalNo,record.clientName];
      if(type==="contra"||type==="journal"){
        values.push(ledgerSide(record,"in"),ledgerSide(record,"out"),record.amount,ledgerSide(record,"in")&&ledgers.find(item=>item.id===ledgerSide(record,"in"))?.name,ledgerSide(record,"out")&&ledgers.find(item=>item.id===ledgerSide(record,"out"))?.name);
      }
      return values.some(value=>String(value||"").toLowerCase().includes(query));
    });
    if(type==="contra"){
      const ledgerName=id=>ledgers.find(item=>item.id===id)?.name||"—";
      el("voucherRows").innerHTML=visible.length?visible.map(record=>`<tr><td>${escapeHtml(record.documentNo||record.id)}</td><td>${escapeHtml(record.date||"—")}</td><td>${escapeHtml(ledgerName(ledgerSide(record,"in")))}</td><td>${escapeHtml(ledgerName(ledgerSide(record,"out")))}</td><td>${escapeHtml(formatCurrency(record.amount||record.debitTotal||0,currency))}</td><td>${escapeHtml(record.narration||"—")}</td><td>${escapeHtml(record.reference||"—")}</td><td><button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit">✎</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete">×</button></td></tr>`).join(""):`<tr><td colspan="8"><div class="empty"><p>No Contra records.</p></div></td></tr>`;
      return;
    }
    if(type==="journal"){
      const ledgerName=id=>ledgers.find(item=>item.id===id)?.name||"—";
      el("voucherRows").innerHTML=visible.length?visible.map(record=>`<tr><td>${escapeHtml(record.documentNo||record.id)}</td><td>${escapeHtml(record.date||"—")}</td><td>${escapeHtml(ledgerName(ledgerSide(record,"in")))}</td><td>${escapeHtml(ledgerName(ledgerSide(record,"out")))}</td><td>${escapeHtml(formatCurrency(voucherAmount(record)||0,currency))}</td><td>${escapeHtml(record.narration||"—")}</td><td><button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit">✎</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete">×</button></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty"><p>No Journal records.</p></div></td></tr>`;
      return;
    }
    el("voucherRows").innerHTML=visible.length?visible.map(record=>`<tr><td>${escapeHtml(record.documentNo||record.id)}</td><td>${escapeHtml(record.date||"—")}</td><td>${escapeHtml(record.partyName||record.originalNo||record.narration||record.reference||"—")}</td><td>${escapeHtml(formatCurrency(record.total||record.debitTotal||0,currency))}</td><td>${record.convertedSaleNo?`Converted ${escapeHtml(record.convertedSaleNo)}`:record.convertedSaleId?"Converted":""}</td><td>${config.kind==="estimate"?record.convertedSaleId?"Converted":`<button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit">✎</button><button class="btn btn-outline" data-action="convert" data-id="${escapeHtml(record.id)}">Convert to Sale</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete">×</button>`:`<button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit">✎</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete">×</button>`}</td></tr>`).join(""):`<tr><td colspan="6"><div class="empty"><p>No ${config.title.toLowerCase()} records.</p></div></td></tr>`;
  }
  function openEditor(record=null){
    form.reset();
    el("voucherTitle").textContent=`${record?"Edit":"New"} ${config.prefix}`;
    el("voucherFields").innerHTML=formMarkup(record);
    el("voucherFormFeedback").hidden=true;
    if(type==="contra"){
      el("voucherHead").innerHTML="<tr><th>Contra ID</th><th>Date</th><th>Ledger in</th><th>Ledger out</th><th>Amount</th><th>Narration</th><th>Ref No</th><th>Actions</th></tr>";
    }else if(type==="journal"){
      el("voucherHead").innerHTML="<tr><th>Journal ID</th><th>Date</th><th>Ledger in</th><th>Ledger out</th><th>Amount</th><th>Narration</th><th>Actions</th></tr>";
    }else if(config.kind==="ledger"){
      el("voucherHead").innerHTML="<tr><th>Voucher No.</th><th>Date</th><th>Narration</th><th>Amount</th><th></th><th>Actions</th></tr>";
      const entries=record?.entries?.length?record.entries:[{},{}];
      entries.forEach(entry=>addLine(entry));
    }else if(config.kind==="estimate"){
      el("voucherHead").innerHTML="<tr><th>Estimate No.</th><th>Date</th><th>Client / Reference</th><th>Total</th><th>Status</th><th>Actions</th></tr>";
      (record?.items?.length?record.items:[{}]).forEach(item=>addLine(item));
    }else{
      el("voucherHead").innerHTML=`<tr><th>${config.prefix} No.</th><th>Date</th><th>Original record</th><th>Total</th><th></th><th>Actions</th></tr>`;
      (record?.items?.length?record.items:[{}]).forEach(item=>addLine(item));
      form.elements.originalId?.addEventListener("change",()=>{
        el("voucherLineList").replaceChildren();
        addLine({});
      });
    }
    el("voucherAddLine")?.addEventListener("click",()=>addLine({}));
    if(record) form.dataset.recordId=record.id;else delete form.dataset.recordId;
    dialog.showModal();
  }
  async function refresh(){
    feedbackMessage("");
    try{
      const needsLedgerLookups=config.kind==="ledger"||config.kind==="estimate"||type==="contra"||type==="journal";
      const needsEstimateLookups=config.kind==="estimate";
      const needsReturnLookups=config.kind==="return";
      const [recordResult,ledgerResult,clientResult,productResult,serviceResult,sourceResult,companyResult]=await Promise.allSettled([
        listRecords(config.collection),needsLedgerLookups?listRecords("ledger"):Promise.resolve([]),
        needsEstimateLookups?listRecords("clients"):Promise.resolve([]),
        needsEstimateLookups?listRecords("products"):Promise.resolve([]),
        needsEstimateLookups?listRecords("services"):Promise.resolve([]),
        config.source?listRecords(config.source):Promise.resolve([]),
        getCompany()
      ]);
      records=recordResult.status==="fulfilled"?recordResult.value:[];
      ledgers=ledgerResult.status==="fulfilled"?ledgerResult.value:[];
      clients=clientResult.status==="fulfilled"?clientResult.value:[];
      products=productResult.status==="fulfilled"?productResult.value:[];
      services=serviceResult.status==="fulfilled"?serviceResult.value:[];
      sources=sourceResult.status==="fulfilled"?sourceResult.value:[];
      currency=companyResult.status==="fulfilled"?companyResult.value?.cmp_currency||"INR":"INR";
      if(recordResult.status==="rejected") throw recordResult.reason;
      if(needsLedgerLookups&&ledgerResult.status==="rejected") throw ledgerResult.reason;
      if(needsEstimateLookups&&[clientResult,productResult,serviceResult].some(result=>result.status==="rejected")) throw new Error("Could not load clients or catalog items required for estimates.");
      if(needsReturnLookups&&sourceResult.status==="rejected") throw new Error("Could not load original transactions required for returns.");
      if(companyResult.status==="rejected") window.showToast?.("Could not load company currency; using INR.");
      renderRows();
    }catch(error){feedbackMessage(error.message||`Could not load ${config.title.toLowerCase()} records.`);}
  }
  el("voucherCreate").addEventListener("click",()=>openEditor());
  el("voucherRefresh").addEventListener("click",()=>void refresh());
  el("voucherSearch").addEventListener("input",renderRows);
  el("voucherClose").addEventListener("click",()=>dialog.close());
  el("voucherCancel").addEventListener("click",()=>dialog.close());
  el("voucherRows").addEventListener("click",async event=>{
    const button=event.target.closest("[data-action]");
    if(!button)return;
    const record=records.find(item=>item.id===button.dataset.id);
    if(!record)return;
    try{
      if(button.dataset.action==="edit"){
        if(type==="journal"&&!journalCanUseTwoLedgers(record)){
          window.showToast?.("This Journal uses a different entry structure and cannot be edited in the two-ledger form. Create a new two-ledger Journal instead.");
          return;
        }
        openEditor(record);return;
      }
      if(button.dataset.action==="convert"){
        button.disabled=true;
        const sale=await convertEstimateToSale(record.id);
        window.showToast?.(`Estimate converted to ${sale.documentNo}.`);
        await refresh();return;
      }
      if(!window.confirm(`Delete ${record.documentNo||config.prefix}?`))return;
      if(config.kind==="ledger") await deleteAccountingVoucher(config.collection,record.id);
      else       if(config.kind==="return") await saveReturnRecord(config.source==="sales"?"sales":"purchase",record.id,null);
      else if(config.kind==="estimate") await saveEstimate(record.id,null);
      else await deleteRecord(config.collection,record.id);
      await refresh();
    }catch(error){window.showToast?.(error.message||"Could not complete this action.");}
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const saveButton=el("voucherSave");
    const recordId=form.dataset.recordId||null;
    const data=Object.fromEntries(new FormData(form).entries());
    data.date=String(data.date||"");
    saveButton.disabled=true;
    try{
      if(type==="contra"||type==="journal"){
        const amount=Number(data.amount);
        const entries=[
          {accountId:data.ledgerInId,debit:amount,credit:0,narration:String(data.narration||"").trim()},
          {accountId:data.ledgerOutId,debit:0,credit:amount,narration:String(data.narration||"").trim()}
        ];
        await saveAccountingVoucher(config.collection,recordId,{...data,amount,entries});
        window.showToast?.(`${config.prefix} voucher saved.`);
      }else if(config.kind==="ledger"){
        const entries=[...el("voucherLineList").querySelectorAll(".voucher-ledger-line")].map(row=>({accountId:row.querySelector(".line-ledger").value,debit:Number(row.querySelector(".line-debit").value)||0,credit:Number(row.querySelector(".line-credit").value)||0,narration:row.querySelector(".line-narration").value.trim()}));
        await saveAccountingVoucher(config.collection,recordId,{...data,entries});
      }else{
        const entries=[...el("voucherLineList").querySelectorAll(".voucher-item-line")].map(row=>{
          const itemType=row.querySelector(".line-item-type").value;
          const itemId=row.querySelector(".line-item-select").value;
          const quantity=Number(row.querySelector(".line-quantity").value)||0;
          const rate=Number(row.querySelector(".line-rate").value)||0;
          const inventory=config.kind==="return"?sources.find(item=>item.id===data.originalId)?.items?.find(item=>item.itemId===itemId&&item.itemType===itemType):(itemType==="Product"?products:services).find(item=>item.id===itemId);
          const taxRate=Number(inventory?.taxRate)||0;
          const amount=Number((quantity*rate).toFixed(2));
          const taxAmount=Number((amount*taxRate/100).toFixed(2));
          return {itemType,itemId,description:inventory?.description||inventory?.name||"",quantity,rate,taxRate,taxAmount,amount:Number((amount+taxAmount).toFixed(2))};
        }).filter(item=>item.itemId&&item.quantity>0);
        const subtotal=Number(entries.reduce((sum,item)=>sum+item.quantity*item.rate,0).toFixed(2));
        const taxAmount=Number(entries.reduce((sum,item)=>sum+item.taxAmount,0).toFixed(2));
        const payload={...data,items:entries,subtotal,taxAmount,total:Number((subtotal+taxAmount).toFixed(2))};
        if(config.kind==="estimate"){
          const client=clients.find(item=>item.id===payload.clientId);
          payload.clientName=client?.name||"";
          payload.notes=data.narration||"";
          const saved=await saveEstimate(recordId,payload);
          window.showToast?.(`${config.prefix} saved (${saved.documentNo}).`);
        }else{
          payload.reference=data.reference||"";
          payload.notes=data.narration||"";
          const saved=await saveReturnRecord(config.source==="sales"?"sales":"purchase",recordId,payload);
          window.showToast?.(`${config.prefix} saved (${saved.documentNo}).`);
        }
      }
      if(config.kind==="ledger"&&!["contra","journal"].includes(type)) window.showToast?.(`${config.prefix} voucher saved.`);
      dialog.close();await refresh();
    }catch(error){formFeedback.textContent=error.message||"Could not save this voucher.";formFeedback.hidden=false;}
    finally{saveButton.disabled=false;}
  });
  await refresh();
  el("voucherHead").innerHTML=type==="contra"?"<tr><th>Contra ID</th><th>Date</th><th>Ledger in</th><th>Ledger out</th><th>Amount</th><th>Narration</th><th>Ref No</th><th>Actions</th></tr>":type==="journal"?"<tr><th>Journal ID</th><th>Date</th><th>Ledger in</th><th>Ledger out</th><th>Amount</th><th>Narration</th><th>Actions</th></tr>":config.kind==="ledger"?"<tr><th>Voucher No.</th><th>Date</th><th>Narration</th><th>Amount</th><th></th><th>Actions</th></tr>":config.kind==="estimate"?"<tr><th>Estimate No.</th><th>Date</th><th>Client / Reference</th><th>Total</th><th>Status</th><th>Actions</th></tr>":`<tr><th>${config.prefix} No.</th><th>Date</th><th>Original record</th><th>Total</th><th></th><th>Actions</th></tr>`;
}
