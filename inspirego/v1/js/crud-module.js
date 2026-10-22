import { createRecord, deletePurchase, deleteRecord, deleteSale, getCompany, getCompanyLogoBlob, listRecords, savePurchase, saveSale, updateRecord } from "./firebase-service.js?v=12";
import { companyLogoSource, createInvoiceHtml, invoiceMessage } from "../modules/invoice-document.js?v=6";
import { createTransactionReceiptHtml, transactionMessage } from "../modules/transaction-receipt.js";
import { formatCurrency } from "./currency.js";

const CURRENCY_FIELDS = new Set(["amount","price","purchasePrice","rate","openingBalance","currentBalance","receivableBalance","payableBalance","total"]);

const MODULE_CONFIG = {
  branches:{title:"Branches",singular:"Branch",icon:"account_tree",description:"Manage business locations and designate the main branch.",fields:[{key:"name",label:"Branch name",required:true},{key:"branchCode",label:"Branch code"},{key:"isMainBranch",label:"Main Branch",type:"select",options:["No","Yes"],defaultValue:"No"},{key:"address",label:"Address",type:"textarea"},{key:"manager",label:"Manager"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"city",label:"City"},{key:"status",label:"Branch Status",type:"select",options:["Active","Inactive"],defaultValue:"Active"}]},
  clients:{title:"Clients",singular:"Client",clientModule:true,icon:"group",description:"Manage client contact details and account balances.",fields:[
    {key:"name",label:"Client name",section:"Client details",required:true},
    {key:"contactPerson",label:"Contact person",section:"Client details"},
    {key:"email",label:"Email",type:"email",section:"Client details"},
    {key:"phone",label:"Phone",type:"tel",section:"Client details"},
    {key:"gstin",label:"GSTIN / Tax ID",section:"Client details",tableHidden:true},
    {key:"status",label:"Status",type:"select",options:["Active","Inactive"],defaultValue:"Active",section:"Client details"},
    {key:"address",label:"Address",type:"textarea",section:"Address",tableHidden:true},
    {key:"city",label:"City",section:"Address",tableHidden:true},
    {key:"district",label:"District",section:"Address",tableHidden:true},
    {key:"state",label:"State",section:"Address",tableHidden:true},
    {key:"pin",label:"Pincode",section:"Address",tableHidden:true},
    {key:"country",label:"Country",section:"Address",tableHidden:true},
    {key:"openingBalance",label:"Opening balance",type:"number",defaultValue:"0",section:"Account balances",help:"Enter the balance at the start of your records. Positive means the client owes you; negative means a client credit."},
    {key:"receivableBalance",label:"Due",type:"number",tableOnly:true}
  ]},
  suppliers:{title:"Suppliers",singular:"Supplier",supplierModule:true,icon:"local_shipping",description:"Manage supplier contacts and payable balances.",fields:[
    {key:"name",label:"Supplier name",required:true,section:"Supplier details"},
    {key:"contactPerson",label:"Contact person",section:"Supplier details"},
    {key:"email",label:"Email",type:"email",section:"Supplier details"},
    {key:"phone",label:"Phone",type:"tel",section:"Supplier details"},
    {key:"gstin",label:"GSTIN / Tax ID",section:"Supplier details",tableHidden:true},
    {key:"status",label:"Status",type:"select",options:["Active","Inactive"],defaultValue:"Active",section:"Supplier details"},
    {key:"address",label:"Address",type:"textarea",section:"Address",tableHidden:true},
    {key:"city",label:"City",section:"Address",tableHidden:true},
    {key:"state",label:"State",section:"Address",tableHidden:true},
    {key:"pin",label:"Pincode",section:"Address",tableHidden:true},
    {key:"country",label:"Country",section:"Address",tableHidden:true},
    {key:"openingBalance",label:"Opening balance",type:"number",defaultValue:"0",section:"Account balances",help:"Positive balances represent amounts payable to the supplier."},
    {key:"payableBalance",label:"Due",type:"number",tableOnly:true}
  ]},
  staff:{title:"Staff",icon:"badge",description:"Manage employees and staff details.",fields:[{key:"name",label:"Staff name",required:true},{key:"role",label:"Role"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"branch",label:"Branch"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  products:{title:"Products",icon:"inventory_2",description:"Manage products, pricing and stock.",inventorySingular:"Product",productModule:true,fields:[{key:"name",label:"Product Name",required:true},{key:"categoryId",label:"Category",type:"reference",lookup:"product-categories",required:true},{key:"hsnCode",label:"HSN Code",pattern:"\\d{4,8}",maxLength:8,placeholder:"4 to 8 digit HSN"},{key:"unit",label:"UQC",type:"select",options:["PCS","NOS","KGS","GMS","LTR","MTR","BOX","SET","HRS","DAY"],required:true},{key:"price",label:"Rate",type:"number",min:"0"},{key:"purchasePrice",label:"Purchase Rate",type:"number",min:"0",tableHidden:true},{key:"taxRate",label:"Tax Rate (%)",type:"number",min:"0",max:"100"},{key:"stock",label:"Qty",type:"number",min:"0"}]},
  "product-categories":{title:"Product Categories",singular:"Product Category",icon:"category",categoryModule:true,description:"Create and manage product categories.",fields:[{key:"name",label:"Category Name",required:true},{key:"description",label:"Description",type:"textarea"}]},
  "service-categories":{title:"Service Categories",singular:"Service Category",icon:"category",categoryModule:true,description:"Create and manage service categories.",fields:[{key:"name",label:"Category Name",required:true},{key:"description",label:"Description",type:"textarea"}]},
  services:{title:"Services",icon:"design_services",description:"Manage service details, categories and pricing.",inventorySingular:"Service",fields:[{key:"name",label:"Service Name",required:true},{key:"categoryId",label:"Category",type:"reference",lookup:"service-categories",required:true},{key:"description",label:"Description",type:"textarea"},{key:"taxRate",label:"Tax Rate (%)",type:"number",min:"0",max:"100"},{key:"price",label:"Rate",type:"number",min:"0"}]},
  sales:{title:"Sales",icon:"point_of_sale",description:"Record sales of products and services with ledger and inventory posting.",formDescription:"Choose a Sales/Income ledger, the party, and add one or more product or service lines.",salesWorkflow:true,filterKey:"partyType",fields:[{key:"date",label:"Date",type:"date",defaultToday:true,required:true,tableHidden:true},{key:"salesLedgerId",label:"Sale Ledger",type:"reference",lookup:"ledger",lookupFilter:"sales-ledger",required:true,tableHidden:true},{key:"partyType",label:"Party",type:"select",options:["Cash","Bank","Sundry Debtors"],required:true,tableHidden:true},{key:"partyLedgerId",label:"Cash / Bank Ledger",type:"reference",lookup:"ledger",lookupFilter:"cash-bank-ledger",required:true,tableHidden:true},{key:"clientId",label:"Client",type:"reference",lookup:"clients",required:true,tableHidden:true},{key:"reference",label:"Reference No.",required:true,tableHidden:true},{key:"notes",label:"Notes",type:"textarea",tableHidden:true}]},
  purchases:{title:"Purchases",icon:"shopping_cart",description:"Record supplier purchases, inventory, and payable balances.",formDescription:"Choose a Purchase/Expense ledger, supplier or payment account, and add product or service lines.",purchaseWorkflow:true,filterKey:"partyType",fields:[{key:"date",label:"Date",type:"date",defaultToday:true,required:true,tableHidden:true},{key:"purchaseLedgerId",label:"Purchase Ledger",type:"reference",lookup:"ledger",lookupFilter:"purchase-ledger",required:true,tableHidden:true},{key:"partyType",label:"Party",type:"select",options:["Cash","Bank","Sundry Creditors"],required:true,tableHidden:true},{key:"partyLedgerId",label:"Cash / Bank / Creditors Ledger",type:"reference",lookup:"ledger",lookupFilter:"purchase-party-ledger",required:true,tableHidden:true},{key:"supplierId",label:"Supplier",type:"reference",lookup:"suppliers",required:true,tableHidden:true},{key:"reference",label:"Reference No.",required:true,tableHidden:true},{key:"notes",label:"Notes",type:"textarea",tableHidden:true}]},
  invoices:{title:"Invoices",icon:"receipt_long",description:"Manage invoices and outstanding balances.",fields:[{key:"customer",label:"Customer",required:true},{key:"invoiceNumber",label:"Invoice number"},{key:"date",label:"Invoice date",type:"date"},{key:"dueDate",label:"Due date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentStatus",label:"Payment status",type:"select",options:["Unpaid","Partially paid","Paid","Overdue"]}]},
  expenses:{title:"Expenses",icon:"payments",description:"Record and review business expenses.",fields:[{key:"category",label:"Category",required:true},{key:"description",label:"Description"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentMethod",label:"Payment method"},{key:"notes",label:"Notes",type:"textarea"}]},
  transactions:{title:"Transactions",icon:"account_balance",description:"Track client receipts and supplier payments across cash and bank accounts.",fields:[{key:"type",label:"Transaction type",type:"select",required:true,options:["Receipt","Payment"]},  {key:"partyType",label:"Party type",type:"select",required:true,defaultValue:"Client",options:["Client","Supplier"]},{key:"party",label:"Client",type:"reference",lookup:"clients",required:true},{key:"partyEmail",label:"Email",type:"email"},{key:"partyPhone",label:"Phone",type:"tel"},{key:"reference",label:"Reference"},{key:"date",label:"Date",type:"date",defaultToday:true},{key:"amount",label:"Amount",type:"number",required:true},{key:"account",label:"Payment mode",type:"reference",lookup:"ledger",required:true},{key:"notes",label:"Notes",type:"textarea"}]},
  payments:{title:"Payments",icon:"currency_rupee",description:"Manage incoming and outgoing payments.",fields:[{key:"party",label:"Customer or supplier",required:true},{key:"reference",label:"Payment reference"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"method",label:"Payment method"},{key:"status",label:"Status",type:"select",options:["Pending","Completed","Failed"]}]},
  qr:{title:"QR Codes",icon:"qr_code_2",description:"Store and manage QR code destinations.",fields:[{key:"name",label:"QR label",required:true},{key:"value",label:"QR value or URL",required:true},{key:"purpose",label:"Purpose"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  reports:{title:"Reports",icon:"bar_chart",description:"Save report definitions for your team.",fields:[{key:"name",label:"Report name",required:true},{key:"reportType",label:"Report type"},{key:"period",label:"Period"},{key:"notes",label:"Notes",type:"textarea"}]},
  settings:{title:"Settings",icon:"settings",description:"Manage workspace settings.",fields:[{key:"name",label:"Setting name",required:true},{key:"value",label:"Value",type:"textarea"},{key:"description",label:"Description",type:"textarea"}]},
  ledger:{title:"Ledgers",singular:"Ledger",ledgerModule:true,filterKey:"category",icon:"account_balance_wallet",description:"Chart of accounts grouped by account head, with opening and current balances.",fields:[{key:"name",label:"Ledger name",required:true},{key:"category",label:"Under",type:"select",required:true,options:["Assets","Liabilities","Equity","Income","Expenses"]},{key:"accountType",label:"Account type",type:"select",options:["Other","Cash","Bank"],defaultValue:"Other"},{key:"openingBalance",label:"Opening balance",type:"number",required:true,defaultValue:"0"},{key:"balanceType",label:"Balance type",type:"select",required:true,options:["Debit","Credit"]},{key:"bankName",label:"Bank name",bankOnly:true},{key:"accountHolderName",label:"Account holder",bankOnly:true},{key:"accountNumber",label:"Account number",bankOnly:true},{key:"ifsc",label:"IFSC code",bankOnly:true},{key:"bankBranch",label:"Bank branch",bankOnly:true},{key:"notes",label:"Notes",type:"textarea"},{key:"currentBalance",label:"Current Balance",type:"number",tableOnly:true}]}
};

function todayInputValue(){
  const today=new Date();
  return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}

function transactionLedgers(ledgers){
  const cashLedgers=ledgers.filter(ledger=>
    String(ledger.systemDefaultKey||"").toLowerCase()==="cash" ||
    String(ledger.accountType||"").toLowerCase()==="cash" ||
    String(ledger.name||"").trim().toLowerCase()==="cash"
  );
  const bankLedgers=ledgers.filter(ledger=>
    String(ledger.systemDefaultKey||"").toLowerCase()==="bank" ||
    String(ledger.accountType||"").toLowerCase()==="bank" ||
    String(ledger.name||"").trim().toLowerCase()==="bank"
  );
  const cash=cashLedgers.sort((left,right)=>Number(right.systemDefault===true)-Number(left.systemDefault===true))[0];
  const bankAccounts=new Map();
  bankLedgers.forEach(ledger=>{
    const accountNumber=String(ledger.accountNumber||"").replace(/\s/g,"");
    const key=accountNumber?`account:${accountNumber}`:ledger.systemDefaultKey==="bank"?"default-bank":`id:${ledger.id}`;
    const current=bankAccounts.get(key);
    if(!current||ledger.systemDefault===true&&current.systemDefault!==true) bankAccounts.set(key,ledger);
  });
  return [...(cash?[cash]:[]),...bankAccounts.values()];
}

function renderInput(field,lookups){
  const required = field.required ? " required" : "";
  const placeholder=field.placeholder?` placeholder="${escapeHtml(field.placeholder)}"`:"";
  const id=` id="${escapeHtml(field.key)}"`;
  if(field.type === "reference"){
    const options = lookups[field.lookup].map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || record.title || record.id)}</option>`).join("");
    return `<select class="form-control" name="${field.key}"${id}${required}><option value="">Select ${escapeHtml(field.label.toLowerCase())}</option>${options}</select>`;
  }
  if(field.type === "select"){
    return `<select class="form-control" name="${field.key}"${id}${required}><option value="">Select</option>${field.options.map(option=>`<option value="${escapeHtml(option)}"${option===field.defaultValue?" selected":""}>${escapeHtml(option)}</option>`).join("")}</select>`;
  }
  if(field.type === "textarea") return `<textarea class="form-control" name="${field.key}"${id} rows="3"${placeholder}${required}></textarea>`;
  const defaultValue=field.defaultToday?todayInputValue():field.defaultValue??"";
  return `<input class="form-control" name="${field.key}"${id} type="${field.type || "text"}" value="${escapeHtml(defaultValue)}"${placeholder}${field.type === "number" ? ` step="any"${field.min?` min="${escapeHtml(field.min)}"`:""}` : ""}${field.pattern?` pattern="${escapeHtml(field.pattern)}"`:""}${field.maxLength?` maxlength="${escapeHtml(field.maxLength)}"`:""}${field.readonly?" readonly":""}${required}>`;
}

function renderPage(config,lookups){
  const singular = config.singular || config.title.replace(/s$/,"");
  const inventoryWorkflow=config.salesWorkflow||config.purchaseWorkflow;
  const filterField = config.filterKey?config.fields.find(field=>field.key===config.filterKey):config.singular === "Branch" || config.inventorySingular
    ? config.fields.find(field=>field.key==="name") || config.fields[0]
    : config.fields.find(field=>field.type === "select") || config.fields[0];
  config.tableFields = config.fields.filter(field=>!field.bankOnly&&!field.tableHidden);
  const fieldMarkup=field=>`<div class="form-group${field.bankOnly ? " crud-bank-field" : ""}"${field.bankOnly||field.hidden ? " hidden" : ""}><label for="${escapeHtml(field.key)}">${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}</label>${renderInput(field,lookups)}${field.help?`<small class="crud-field-help">${escapeHtml(field.help)}</small>`:""}</div>`;
  const editableFields=config.fields.filter(field=>!field.tableOnly);
  const fields=editableFields.some(field=>field.section)
    ? editableFields.reduce((sections,field)=>{
      const name=field.section||"Details";
      if(!sections.has(name)) sections.set(name,[]);
      sections.get(name).push(fieldMarkup(field));
      return sections;
    },new Map())
    : null;
  const fieldContent=fields
    ? [...fields].map(([name,items])=>`<section class="crud-form-section"><h3>${escapeHtml(name)}</h3><div class="form-grid">${items.join("")}</div></section>`).join("")
    : `<div class="form-grid">${editableFields.map(fieldMarkup).join("")}</div>`;
  const dialogClass=config.formDescription?"crud-dialog sales-dialog":"crud-dialog";
  const headers = config.ledgerModule
    ? "<th>Ledger ID</th><th>Ledger name</th><th>Under</th><th>Account type</th><th>Opening balance</th><th>Current balance</th><th>Balance type</th><th>Actions</th>"
    : config.salesWorkflow
    ? "<th>Sales ID</th><th>Date</th><th>Sale Ledger</th><th>Party</th><th>Amount</th><th>Action</th>"
    : config.purchaseWorkflow
      ? "<th>Purchase ID</th><th>Date</th><th>Purchase Ledger</th><th>Supplier / Account</th><th>Amount</th><th>Action</th>"
    : config.clientModule
      ? "<th>Client ID</th><th>Client name</th><th>Email</th><th>Phone</th><th>Opening balance</th><th>Due</th><th>Status</th><th>Actions</th>"
    : config.supplierModule
      ? "<th>Supplier ID</th><th>Supplier name</th><th>Email</th><th>Phone</th><th>Opening balance</th><th>Due</th><th>Status</th><th>Actions</th>"
    : config.categoryModule
    ? `<th>Category ID</th>${config.tableFields.map(field=>`<th>${escapeHtml(field.label)}</th>`).join("")}<th>Action</th>`
    : config.singular === "Branch"
    ? "<th>Branch ID</th><th>Branch Name</th><th>Address</th><th>Email</th><th>Phone</th><th>Action</th>"
    : config.inventorySingular
      ? `<th>${escapeHtml(config.inventorySingular)} ID</th>${config.tableFields.map(field=>`<th>${escapeHtml(field.label)}</th>`).join("")}<th>Action</th>`
      : config.tableFields.map(field=>`<th>${escapeHtml(field.label)}</th>`).join("");
  const pageClass=config.ledgerModule?" ledger-crud-page":config.singular==="Branch"?" branches-crud-page":config.clientModule?" clients-crud-page":config.supplierModule?" clients-crud-page suppliers-crud-page":config.inventorySingular?` inventory-crud-page${config.productModule?" products-crud-page":""}`:config.categoryModule?" product-categories-page":config.purchaseWorkflow?" sales-crud-page purchases-crud-page":inventoryWorkflow?" sales-crud-page":"";
  return `<div class="module-page crud-page${pageClass}">
    <div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">${config.icon}</span></div><div><h1>${config.title}</h1><p>${config.description}</p></div></div><div class="actions"><button class="btn btn-outline" id="crudRefresh" type="button" title="Refresh"><span class="material-symbols-rounded">refresh</span><span>Refresh</span></button><button class="btn btn-primary" id="crudCreate" type="button"><span class="material-symbols-rounded">add</span><span>Add ${singular}</span></button></div></div>
    <div class="card card-pad"><div class="crud-toolbar"><input class="input-search" id="crudSearch" type="search" placeholder="Search ${config.title.toLowerCase()}..." aria-label="Search ${config.title}"><select class="form-control crud-select" id="crudFilter" aria-label="Filter by ${escapeHtml(filterField.label)}"><option value="">All ${escapeHtml(config.title.toLowerCase())}</option></select><select class="form-control crud-select" id="crudSort" aria-label="Sort records"><option value="updated-desc"${config.ledgerModule?"":" selected"}>Recent</option><option value="updated-asc">Oldest</option><option value="field-asc">${escapeHtml(filterField.label)} A-Z</option><option value="field-desc">${escapeHtml(filterField.label)} Z-A</option>${config.ledgerModule?'<option value="head-asc" selected>Account head A-Z</option><option value="head-desc">Account head Z-A</option>':""}</select><button class="btn btn-outline crud-toolbar-icon" id="crudImport" type="button" title="Import records from CSV" aria-label="Import records from CSV"><span class="material-symbols-rounded">upload</span><span class="crud-control-label">Import CSV</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudPdf" type="button" title="Download filtered data as PDF" aria-label="Download filtered data as PDF"><span class="material-symbols-rounded">picture_as_pdf</span><span class="crud-control-label">PDF</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudPdfImport" type="button" title="Attach a PDF" aria-label="Import PDF"><span class="material-symbols-rounded">attach_file</span><span class="crud-control-label">Import PDF</span></button></div><input id="crudCsvFile" type="file" accept=".csv,text/csv" hidden><input id="crudPdfFile" type="file" accept=".pdf,application/pdf" hidden><p class="crud-feedback" id="crudFeedback" role="status" hidden></p><div class="table-wrap"><table class="data-table"><thead><tr>${headers}${config.ledgerModule || config.singular === "Branch" || config.clientModule || config.supplierModule || config.inventorySingular || config.categoryModule || inventoryWorkflow ? "" : "<th>Updated</th><th>Actions</th>"}</tr></thead><tbody id="crudRows"><tr><td colspan="${config.ledgerModule?8:inventoryWorkflow?6:config.singular === "Branch" ? 6 : config.clientModule || config.supplierModule ? 8 : config.inventorySingular ? config.tableFields.length+2 : config.categoryModule ? config.tableFields.length+2 : config.fields.length+2}"><div class="loader"><span class="material-symbols-rounded">sync</span></div></td></tr></table></div><section class="crud-pdf-documents"><h2>PDF attachments</h2><div id="crudPdfRows"><p class="crud-pdf-empty">Loading attachments...</p></div></section></div>
    <dialog class="${dialogClass}" id="crudDialog"><form id="crudForm"><div class="crud-dialog-header"><h2 id="crudDialogTitle">Add ${config.title.replace(/s$/,"")}</h2><button class="icon-button" type="button" id="crudClose" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div>${config.formDescription?`<p class="crud-form-description">${escapeHtml(config.formDescription)}</p>`:""}<input type="hidden" name="recordId">${fieldContent}<div class="form-actions"><button class="btn btn-outline" type="button" id="crudCancel">Cancel</button><button class="btn btn-primary" id="crudSave" type="submit"><span class="material-symbols-rounded">save</span><span>Save</span></button></div></form></dialog>
    ${config.singular === "Branch" ? '<dialog class="branch-details-dialog" id="branchDetailsDialog"><div class="crud-dialog-header"><h2 id="branchDetailsTitle">Branch details</h2><button class="icon-button" type="button" id="branchDetailsClose" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div id="branchDetailsContent"></div><div class="form-actions"><button class="btn btn-outline" id="branchCardDownload" type="button"><span class="material-symbols-rounded">download</span> Download Branch Card</button><button class="btn btn-outline crud-delete" id="branchDetailsDelete" type="button"><span class="material-symbols-rounded">delete</span> Delete Branch</button><button class="btn btn-primary" id="branchDetailsEdit" type="button"><span class="material-symbols-rounded">edit</span> Edit Branch</button></div></dialog>' : ""}
    ${config.ledgerModule ? '<dialog class="ledger-details-dialog" id="ledgerDetailsDialog"><div class="crud-dialog-header"><h2 id="ledgerDetailsTitle">Ledger details</h2><button class="icon-button" type="button" id="ledgerDetailsClose" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div id="ledgerDetailsContent"></div><div class="form-actions"><button class="btn btn-outline crud-delete" id="ledgerDetailsDelete" type="button"><span class="material-symbols-rounded">delete</span>Delete Ledger</button><button class="btn btn-primary" id="ledgerDetailsEdit" type="button"><span class="material-symbols-rounded">edit</span>Edit Ledger</button></div></dialog>' : ""}
  </div>`;
}

function formatDate(value){
  if(!value) return "--";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
}

function getFieldValue(record,field,lookups){
  let value = record[field.key];
  if(field.lookup === "clients" && record.partyId){
    const client=lookups.clients.find(item=>item.id===record.partyId);
    if(client) return client.name || client.title || client.id;
  }
  if(value === undefined && field.lookup === "clients") value = record.customer;
  if(value === undefined && field.lookup === "branches") value = record.branch;
  if(field.lookup && value){
    const match = lookups[field.lookup].find(item=>item.id === value || item.name === value);
    if(match) return match.name || match.title || match.id;
  }
  return value ?? "";
}

function getRecordDate(record){
  const value = record.date || record.createdAt || record.updatedAt;
  if(!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0,10);
}

function getLedgerBalanceType(balanceType,balance){
  const naturalSide=String(balanceType||"Debit").toLowerCase()==="credit"?"Credit":"Debit";
  const side=Number(balance)<0?(naturalSide==="Credit"?"Debit":"Credit"):naturalSide;
  return side==="Credit"?"Cr":"Dr";
}

function getDisplayValue(record,field,lookups,currency="INR"){
  const value = field.type === "date" ? formatDate(record[field.key]) : getFieldValue(record,field,lookups);
  if(CURRENCY_FIELDS.has(field.key) && value !== "" && value !== null && value !== undefined){
    return formatCurrency(value,currency);
  }

  return value === null || value === undefined || value === "" ? "--" : value;
}

function branchAddress(record){
  return [record.address,record.city].filter(Boolean).join(", ") || "--";
}

function branchCardHtml(record){
  const branchId=escapeHtml(record.documentNo||record.id||"--");
  const branchName=escapeHtml(record.name||"Branch");
  const address=escapeHtml(branchAddress(record));
  const email=escapeHtml(record.email||"--");
  const phone=escapeHtml(record.phone||"--");
  const status=escapeHtml(record.status||"Active");
  const activeStatus=String(record.status||"Active").toLowerCase()==="active";
  const mainBranch=record.isMainBranch==="Yes"||record.isMainBranch===true;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${branchName} - Branch Card</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f2f5f9;color:#263445;font:14px/1.5 Arial,sans-serif}.toolbar{max-width:680px;margin:0 auto 14px;text-align:right}.toolbar button{border:0;border-radius:8px;padding:10px 16px;background:#174a7e;color:#fff;font-weight:600;cursor:pointer}.card{max-width:680px;margin:auto;padding:30px;border:1px solid #dce3eb;border-radius:14px;background:#fff;box-shadow:0 8px 28px #17202b14}.brand{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:20px;border-bottom:2px solid #174a7e}.brand h1{margin:0;color:#174a7e;font-size:24px}.branch-id{color:#596779;font-size:13px}.details{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;padding:24px 0}.item span{display:block;color:#687583;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.item strong{display:block;margin-top:4px;overflow-wrap:anywhere}.status{display:inline-block;padding:3px 9px;border-radius:20px;background:${activeStatus?"#e6f4ea":"#fce8e6"};color:${activeStatus?"#137333":"#b3261e"}}.footer{padding-top:14px;border-top:1px solid #e1e4e2;color:#687583;font-size:11px}@page{size:A5;margin:12mm}@media print{body{padding:0;background:#fff}.toolbar{display:none}.card{max-width:none;border:0;box-shadow:none;padding:0}}@media(max-width:520px){body{padding:12px}.card{padding:20px}.details{grid-template-columns:1fr;gap:14px}}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Download / Print Branch Card</button></div><main class="card"><header class="brand"><div><h1>${branchName}</h1>${mainBranch?'<strong>Main Branch</strong>':""}</div><strong class="branch-id">Branch ID: ${branchId}</strong></header><section class="details"><div class="item"><span>Address</span><strong>${address}</strong></div><div class="item"><span>Email</span><strong>${email}</strong></div><div class="item"><span>Phone</span><strong>${phone}</strong></div><div class="item"><span>Manager</span><strong>${escapeHtml(record.manager||"--")}</strong></div><div class="item"><span>Status</span><strong><i class="status">${status}</i></strong></div><div class="item"><span>Branch Code</span><strong>${escapeHtml(record.branchCode||"--")}</strong></div></section><footer class="footer">COREBIQ CRM + ERP · Branch Card</footer></main></body></html>`;
}

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(String(reader.result||""));
    reader.onerror = ()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function initCrudModule(moduleName,options={}){
  const sourceConfig = MODULE_CONFIG[moduleName];
  let config = sourceConfig && {...sourceConfig,fields:sourceConfig.fields.map(field=>({...field}))};
  const container = document.getElementById("moduleContainer");
  if(!config || !container) return;
  if(moduleName==="transactions"&&options.transactionType){
    const title=options.transactionType;
    config={...config,title,singular:title,filterKey:"party",description:["Payment","Receipt"].includes(title)?`Record ${title.toLowerCase()} vouchers between Cash/Bank and ledger accounts.`:`Record ${title.toLowerCase()} vouchers and update party balances.`,fields:config.fields.map(field=>({
      ...field,
      ...(field.key==="type"||field.key==="partyType"?{hidden:true,tableHidden:true}:{}),
      ...(field.key==="partyEmail"||field.key==="partyPhone"?{hidden:true,tableHidden:true}:{}),
      ...(field.key==="party" && title === "Payment" ? {label:"Given to",lookup:"ledger",lookupFilter:"",type:"reference"} : {}),
      ...(field.key==="party" && title === "Receipt" ? {label:"Received From",lookup:"ledger",lookupFilter:"",type:"reference"} : {}),
      ...(field.key==="party" && !["Payment","Receipt"].includes(title) ? {label:"Client"} : {}),
      ...(field.key==="account" && ["Payment","Receipt"].includes(title) ? {label:title==="Payment"?"Payment Mode":"Receipt Mode",lookupFilter:"cash-bank-ledger"} : {}),
      ...(field.key==="reference" && ["Payment","Receipt"].includes(title) ? {label:"Ref No"} : {}),
      ...(field.key==="notes" && ["Payment","Receipt"].includes(title) ? {label:"Narration"} : {})
    }))};
    config.fields.find(field=>field.key==="type").defaultValue=options.transactionType;
    config.transactionTypeFilter=options.transactionType;
    if(["Payment","Receipt"].includes(title)) config.transactionLedgerPartyMode = true;
    const fieldOrder=["date","account","party","amount","reference","notes","partyEmail","partyPhone"];
    config.fields.sort((left,right)=>{
      const leftIndex=fieldOrder.indexOf(left.key),rightIndex=fieldOrder.indexOf(right.key);
      return (leftIndex<0?fieldOrder.length:leftIndex)-(rightIndex<0?fieldOrder.length:rightIndex);
    });
  }

  let companySettings={};
  let companySettingsError=null;
  try{
    companySettings=await getCompany()||{};
  }catch(error){
    companySettingsError=error;
    console.error("Could not load company settings for module tax fields.",error);
  }
  const taxUnregistered=String(companySettings.cmp_tax_type||"").toLowerCase()==="unregistered";
  const taxFieldKeys=config.fields.filter(field=>/(tax|gst)/i.test(field.key)&&!/gstin/i.test(field.key)).map(field=>field.key);
  if(taxUnregistered) config={...config,fields:config.fields.filter(field=>!taxFieldKeys.includes(field.key)&&(field.key!=="hsnCode"||config.productModule))};

  if(!["clients","suppliers","branches","ledger","transactions","products","services","product-categories","service-categories","sales","purchases"].includes(moduleName)){
    let clientField = config.fields.find(field=>field.key === "customer" || field.key === "clientId");
    if(clientField){
      clientField.key = "clientId";
      clientField.label = "Client";
      clientField.lookup = "clients";
      clientField.type = "reference";
      clientField.required = true;
    }else{
      config.fields.unshift({key:"clientId",label:"Client",type:"reference",lookup:"clients",required:true});
    }
    let branchField = config.fields.find(field=>field.key === "branch" || field.key === "branchId");
    if(branchField){
      branchField.key = "branchId";
      branchField.label = "Branch";
      branchField.lookup = "branches";
      branchField.type = "reference";
      branchField.required = true;
    }else{
      config.fields.splice(1,0,{key:"branchId",label:"Branch",type:"reference",lookup:"branches",required:true,...(moduleName==="sales"?{section:"Travel and booking"}:{})});
    }
  }
  const lookups = {clients:[],suppliers:[],branches:[],ledger:[],products:[],services:[],"product-categories":[],"service-categories":[]};
  container.innerHTML = renderPage(config,lookups);
  if(taxUnregistered&&config.inventorySingular) container.querySelector(".inventory-crud-page")?.classList.add("inventory-tax-unregistered");
  container.querySelectorAll(".loader .material-symbols-rounded").forEach(icon=>{
    icon.className="loading-ring";
    icon.textContent="";
    icon.setAttribute("aria-hidden","true");
  });
  const toolbar = container.querySelector(".crud-toolbar");
  const menuLabel=config.singular||config.inventorySingular||config.title.replace(/s$/,"");
  const actionsMenu=document.createElement("details");
  actionsMenu.className="compact-actions-menu";
  actionsMenu.innerHTML=`<summary class="icon-button" aria-label="${escapeHtml(menuLabel)} actions" title="${escapeHtml(menuLabel)} actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="compact-actions-panel"><button class="compact-clear-filters" id="compactClearFilters" type="button"><span class="material-symbols-rounded">filter_x</span><span>Clear filters & sort</span></button><div class="compact-menu-section"><label for="crudFilter">Filter</label><div class="compact-filter-slot"></div></div><div class="compact-menu-section"><label for="crudSort">Sort</label><div class="compact-sort-slot"></div></div><div class="compact-menu-section"><span class="compact-menu-label">Filter by date</span><div class="compact-date-slot"></div></div><div class="compact-menu-section"><span class="compact-menu-label">Download</span><div class="compact-download-slot"></div></div></div>`;
  actionsMenu.querySelector(".compact-filter-slot").append(document.getElementById("crudFilter"));
  actionsMenu.querySelector(".compact-sort-slot").append(document.getElementById("crudSort"));
  toolbar.append(actionsMenu);
  ["crudImport","crudPdfImport"].forEach(id=>document.getElementById(id)?.remove());
  ["crudCsvFile","crudPdfFile"].forEach(id=>document.getElementById(id)?.remove());
  container.querySelector(".crud-pdf-documents")?.remove();
  const dateFilter = document.createElement("div");
  dateFilter.className = "crud-date-filter";
  dateFilter.innerHTML = `<label>From<input class="form-control" id="crudDateFrom" type="date" aria-label="Filter from date"></label><label>To<input class="form-control" id="crudDateTo" type="date" aria-label="Filter to date"></label>`;
  (actionsMenu?.querySelector(".compact-date-slot") || toolbar).append(dateFilter);
  const sortControl = document.getElementById("crudSort");
  sortControl.insertAdjacentHTML("beforeend",'<option value="date-asc">Date: oldest</option><option value="date-desc">Date: newest</option>');
  const rows = document.getElementById("crudRows");
  const feedback = document.getElementById("crudFeedback");
  if(companySettingsError){
    feedback.textContent=companySettingsError.message||"Could not load company settings.";
    feedback.hidden=false;
  }
  const dialog = document.getElementById("crudDialog");
  const branchDetailsDialog = moduleName==="branches" ? document.getElementById("branchDetailsDialog") : null;
  const ledgerDetailsDialog = config.ledgerModule ? document.getElementById("ledgerDetailsDialog") : null;
  const tableColumnCount=config.ledgerModule?8:config.salesWorkflow||config.purchaseWorkflow?6:moduleName==="branches"?6:config.clientModule||config.supplierModule?8:config.inventorySingular||config.categoryModule?config.tableFields.length+2:config.transactionTypeFilter?config.tableFields.length+3:config.fields.length+3;
  const form = document.getElementById("crudForm");
  const documentNumberField = document.createElement("div");
  documentNumberField.className = "form-group span-2 crud-document-number";
  const documentIdLabel=config.ledgerModule?"Ledger ID":config.salesWorkflow?"Sales ID":config.purchaseWorkflow?"Purchase ID":config.clientModule?"Client ID":config.supplierModule?"Supplier ID":config.categoryModule?"Category ID":config.inventorySingular?`${config.inventorySingular} ID`:config.transactionTypeFilter?`${config.transactionTypeFilter} ID`:"Document No.";
  documentNumberField.innerHTML = `<label for="displayDocumentNo">${escapeHtml(documentIdLabel)}</label><input class="form-control" id="displayDocumentNo" name="displayDocumentNo" type="text" value="Assigned on save" readonly>`;
  form.elements.recordId.after(documentNumberField);
  const headerRow = container.querySelector(".data-table thead tr");
  const dateField = config.fields.find(field=>field.type === "date");
  if(!config.ledgerModule&&moduleName!=="branches"&&!config.clientModule&&!config.supplierModule&&!config.inventorySingular&&!config.categoryModule&&!config.salesWorkflow&&!config.purchaseWorkflow){
    const documentHeader = document.createElement("th");
    documentHeader.textContent = moduleName==="transactions"&&options.transactionType?`${options.transactionType} ID`:"Document No.";
    headerRow.insertBefore(documentHeader,headerRow.firstChild);
    headerRow.children[headerRow.children.length-2].textContent = dateField ? "Updated" : "Date";
  }
  const exportButton = document.getElementById("crudPdf");
  const downloadMenu = document.createElement("div");
  downloadMenu.className="compact-download-options";
  downloadMenu.innerHTML=`<button type="button" id="crudExportCsv"><span class="material-symbols-rounded">table_view</span>CSV (.csv)</button><button type="button" id="crudExportPdf"><span class="material-symbols-rounded">picture_as_pdf</span>PDF (.pdf)</button>`;
  exportButton.replaceWith(downloadMenu);
  if(actionsMenu) actionsMenu.querySelector(".compact-download-slot").append(downloadMenu);
  const printHeading = document.createElement("div");
  printHeading.className = "crud-print-heading";
  printHeading.innerHTML = `<div><p>COREBIQ CRM + ERP</p><h2>${escapeHtml(config.title)} report</h2></div><div><strong id="crudPrintCount"></strong><time id="crudPrintDate"></time></div>`;
  document.querySelector(".crud-page .table-wrap").before(printHeading);
  const printFooter = document.createElement("footer");
  printFooter.className = "crud-print-footer";
  printFooter.innerHTML = `<img class="crud-print-logo" src="assets/logo-app.svg" alt=""><img class="crud-print-wordmark" src="assets/name.svg" alt="COREBIQ CRM ERP">`;
  document.querySelector(".crud-page").append(printFooter);
  const filterField = config.filterKey?config.fields.find(field=>field.key===config.filterKey):moduleName==="branches" || config.inventorySingular
    ? config.fields.find(field=>field.key==="name") || config.fields[0]
    : config.fields.find(field=>field.type === "select") || config.fields[0];
  let records = [];
  let invoiceProfile = {};
  let invoiceBanks = [];
  let companyCurrency = companySettings.cmp_currency || "INR";
  if(config.salesWorkflow||config.purchaseWorkflow){
    form.querySelector(".form-actions").before(Object.assign(document.createElement("section"),{
      className:"crud-form-section sale-inventory-section",
      innerHTML:`<h3>${config.purchaseWorkflow?"Purchase items":"Sale items"}</h3><div class="sale-items-list" id="saleItemsList"></div><button class="btn btn-outline sale-add-item" id="saleAddItem" type="button"><span class="material-symbols-rounded">add</span>Add item</button><div class="sale-totals"><div><span>Subtotal</span><strong id="saleSubtotal">${escapeHtml(formatCurrency(0,companyCurrency))}</strong></div><div class="sale-tax-total"${taxUnregistered?" hidden":""}><span>Tax</span><strong id="saleTaxTotal">${escapeHtml(formatCurrency(0,companyCurrency))}</strong></div><div class="sale-grand-total"><span>Total</span><strong id="saleGrandTotal">${escapeHtml(formatCurrency(0,companyCurrency))}</strong></div></div>`
    }));
  }
  const saleItemsList=config.salesWorkflow||config.purchaseWorkflow?document.getElementById("saleItemsList"):null;
  const saleSubtotal=document.getElementById("saleSubtotal");
  const saleTaxTotal=document.getElementById("saleTaxTotal");
  const saleGrandTotal=document.getElementById("saleGrandTotal");

  function saleItemRecords(type){
    return type==="Product"?lookups.products:lookups.services;
  }

  function makeSaleItemRow(item={}){
    const type=item.itemType==="Product"?"Product":"Service";
    const options=saleItemRecords(type).map(record=>`<option value="${escapeHtml(record.id)}"${record.id===item.itemId?" selected":""}>${escapeHtml(record.name||record.title||record.id)}</option>`).join("");
    const row=document.createElement("div");
    row.className="sale-item-row";
    row.innerHTML=`<label>Type<select class="form-control sale-item-type"><option${type==="Service"?" selected":""}>Service</option><option${type==="Product"?" selected":""}>Product</option></select></label><label>Product / Service<select class="form-control sale-item-select"><option value="">Select ${type.toLowerCase()}</option>${options}</select></label><label>Qty<input class="form-control sale-item-quantity" type="number" min="0.01" step="any" value="${escapeHtml(item.quantity??1)}"></label><label>Rate (${escapeHtml(companyCurrency)})<input class="form-control sale-item-rate" type="number" min="0" step="any" value="${escapeHtml(item.rate??"")}"></label><div class="sale-item-hsn"${taxUnregistered?" hidden":""}><span>HSN</span><strong class="sale-item-hsn-code">${escapeHtml(item.hsnCode||"--")}</strong></div><div class="sale-item-tax"${taxUnregistered?" hidden":""}><span>Tax</span><strong class="sale-item-tax-rate">${escapeHtml(item.taxRate??0)}%</strong></div><div class="sale-item-amount"><span>Amount</span><strong>--</strong></div><button class="icon-button sale-item-remove" type="button" aria-label="Remove item"><span class="material-symbols-rounded">delete</span></button>`;
    return row;
  }

  function calculateSaleTotals(){
    if(!saleItemsList) return {items:[],subtotal:0,taxAmount:0,total:0};
    const items=[...saleItemsList.querySelectorAll(".sale-item-row")].map(row=>{
      const itemType=row.querySelector(".sale-item-type").value;
      const itemId=row.querySelector(".sale-item-select").value;
      const inventory=saleItemRecords(itemType).find(record=>record.id===itemId);
      const quantity=Number(row.querySelector(".sale-item-quantity").value)||0;
      const rate=Number(row.querySelector(".sale-item-rate").value)||0;
      const taxRate=taxUnregistered?0:Number(inventory?.taxRate)||0;
      const hsnCode=taxUnregistered||itemType!=="Product"?"":String(inventory?.hsnCode||"");
      const amount=Number((quantity*rate).toFixed(2));
      const taxAmount=Number((amount*taxRate/100).toFixed(2));
      const line=row.querySelector(".sale-item-amount strong");
      if(line) line.textContent=formatCurrency(amount,companyCurrency);
      const taxLabel=row.querySelector(".sale-item-tax-rate");
      if(taxLabel) taxLabel.textContent=`${taxRate}%`;
      const hsnLabel=row.querySelector(".sale-item-hsn-code");
      if(hsnLabel) hsnLabel.textContent=hsnCode||"--";
      return {itemType,itemId,description:inventory?.name||"",hsnCode,quantity,rate,taxRate,amount,taxAmount};
    }).filter(item=>item.itemId&&item.quantity>0);
    const subtotal=Number(items.reduce((total,item)=>total+item.amount,0).toFixed(2));
    const taxAmount=Number(items.reduce((total,item)=>total+item.taxAmount,0).toFixed(2));
    const total=Number((subtotal+taxAmount).toFixed(2));
    if(saleSubtotal) saleSubtotal.textContent=formatCurrency(subtotal,companyCurrency);
    if(saleTaxTotal) saleTaxTotal.textContent=formatCurrency(taxAmount,companyCurrency);
    if(saleGrandTotal) saleGrandTotal.textContent=formatCurrency(total,companyCurrency);
    return {items,subtotal,taxAmount,total};
  }

  function setSaleItems(items){
    if(!saleItemsList) return;
    saleItemsList.replaceChildren(...(items.length?items:[{}]).map(makeSaleItemRow));
    saleItemsList.querySelectorAll(".sale-item-row").forEach(row=>{
      const typeSelect=row.querySelector(".sale-item-type");
      const itemSelect=row.querySelector(".sale-item-select");
      const rateInput=row.querySelector(".sale-item-rate");
      const refreshItems=selectedItem=>{
        const savedId=selectedItem||itemSelect.value;
        const options=saleItemRecords(typeSelect.value);
        itemSelect.innerHTML=`<option value="">Select ${typeSelect.value.toLowerCase()}</option>${options.map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name||record.title||record.id)}</option>`).join("")}`;
        if(options.some(record=>record.id===savedId)) itemSelect.value=savedId;
      };
      typeSelect.addEventListener("change",()=>{refreshItems("");rateInput.value="";calculateSaleTotals();});
      itemSelect.addEventListener("change",()=>{
        const inventory=saleItemRecords(typeSelect.value).find(record=>record.id===itemSelect.value);
        rateInput.value=config.purchaseWorkflow?(inventory?.purchasePrice??inventory?.price??""):(inventory?.price??"");
        calculateSaleTotals();
      });
      row.querySelector(".sale-item-quantity").addEventListener("input",calculateSaleTotals);
      rateInput.addEventListener("input",calculateSaleTotals);
      row.querySelector(".sale-item-remove").addEventListener("click",()=>{
        if(saleItemsList.children.length===1){setSaleItems([{}]);return;}
        row.remove();
        calculateSaleTotals();
      });
      calculateSaleTotals();
    });
    window.COREBIQ?.renderIcons(saleItemsList);
  }

  function syncSalePartyFields(){
    if(!config.salesWorkflow) return;
    const partyType=form.elements.partyType.value;
    const ledgerGroup=form.elements.partyLedgerId.closest(".form-group");
    const clientGroup=form.elements.clientId.closest(".form-group");
    const referenceGroup=form.elements.reference.closest(".form-group");
    ledgerGroup.hidden=partyType==="Sundry Debtors"||!partyType;
    clientGroup.hidden=partyType!=="Sundry Debtors";
    referenceGroup.hidden=partyType!=="Cash"&&partyType!=="Bank";
    form.elements.partyLedgerId.required=partyType==="Cash"||partyType==="Bank";
    form.elements.clientId.required=partyType==="Sundry Debtors";
    form.elements.reference.required=partyType==="Cash"||partyType==="Bank";
    if(partyType==="Cash"||partyType==="Bank"){
      const selectedLedger=form.elements.partyLedgerId.value;
      const ledgerOptions=lookups.ledger.filter(ledger=>String(ledger.systemDefaultKey||ledger.accountType||"").toLowerCase()===partyType.toLowerCase());
      form.elements.partyLedgerId.innerHTML=`<option value="">Select ${partyType.toLowerCase()} ledger</option>${ledgerOptions.map(ledger=>`<option value="${escapeHtml(ledger.id)}">${escapeHtml(ledger.name||ledger.id)}</option>`).join("")}`;
      if(ledgerOptions.some(ledger=>ledger.id===selectedLedger)) form.elements.partyLedgerId.value=selectedLedger;
    }
  }

  function syncPurchasePartyFields(){
      if(!config.purchaseWorkflow) return;
      const partyType=form.elements.partyType.value;
      const ledgerGroup=form.elements.partyLedgerId.closest(".form-group");
      const supplierGroup=form.elements.supplierId.closest(".form-group");
      const referenceGroup=form.elements.reference.closest(".form-group");
      ledgerGroup.hidden=!partyType;
      supplierGroup.hidden=partyType!=="Sundry Creditors";
      referenceGroup.hidden=partyType==="Sundry Creditors"||!partyType;
      form.elements.partyLedgerId.required=Boolean(partyType);
      form.elements.supplierId.required=partyType==="Sundry Creditors";
      form.elements.reference.required=partyType==="Cash"||partyType==="Bank";
      const ledgerLabel=form.elements.partyLedgerId.closest(".form-group").querySelector("label");
      ledgerLabel.textContent=partyType==="Sundry Creditors"?"Sundry Creditors Ledger":"Cash / Bank Ledger";
      const selectedLedger=form.elements.partyLedgerId.value;
      const ledgerOptions=partyType==="Sundry Creditors"
        ?lookups.ledger.filter(ledger=>ledger.systemDefaultKey==="sundry-creditors")
        :lookups.ledger.filter(ledger=>String(ledger.systemDefaultKey||ledger.accountType||"").toLowerCase()===partyType.toLowerCase());
      form.elements.partyLedgerId.innerHTML=`<option value="">Select ${partyType==="Sundry Creditors"?"Sundry Creditors":"cash or bank"} ledger</option>${ledgerOptions.map(ledger=>`<option value="${escapeHtml(ledger.id)}">${escapeHtml(ledger.name||ledger.id)}</option>`).join("")}`;
      if(ledgerOptions.some(ledger=>ledger.id===selectedLedger)) form.elements.partyLedgerId.value=selectedLedger;
  }

  function applyCompanyCurrency(){
    if(config.ledgerModule){
      headerRow.children[4].textContent=`Opening balance (${companyCurrency})`;
      headerRow.children[5].textContent=`Current balance (${companyCurrency})`;
    }else if(config.purchaseWorkflow){
      headerRow.children[4].textContent=`Amount (${companyCurrency})`;
    }else if(config.clientModule){
      headerRow.children[4].textContent=`Opening balance (${companyCurrency})`;
      headerRow.children[5].textContent=`Due (${companyCurrency})`;
      const openingLabel=form.elements.openingBalance.closest(".form-group").querySelector("label");
      openingLabel.textContent=`Opening balance (${companyCurrency})`;
    }else if(config.supplierModule){
      headerRow.children[4].textContent=`Opening balance (${companyCurrency})`;
      headerRow.children[5].textContent=`Due (${companyCurrency})`;
      form.elements.openingBalance.closest(".form-group").querySelector("label").textContent=`Opening balance (${companyCurrency})`;
    }else{
      config.tableFields.forEach((field,index)=>{
        if(!CURRENCY_FIELDS.has(field.key)) return;
        const header=headerRow.children[index+1];
        if(header) header.textContent=`${field.label} (${companyCurrency})`;
        const input=form.elements[field.key];
        const label=input?.closest(".form-group")?.querySelector("label");
        if(label) label.textContent=`${field.label} (${companyCurrency})`;
      });
      if(config.productModule){
        const purchaseRateLabel=form.elements.purchasePrice?.closest(".form-group")?.querySelector("label");
        if(purchaseRateLabel) purchaseRateLabel.textContent=`Purchase Rate (${companyCurrency})`;
      }
    }
    saleItemsList?.querySelectorAll(".sale-item-row label:nth-child(4)").forEach(label=>{
      if(label.firstChild) label.firstChild.textContent=`Rate (${companyCurrency})`;
    });
    renderRows();
  }

  async function refreshInvoiceContext(){
    const [companyResult,ledgerResult] = await Promise.allSettled([getCompany(),listRecords("ledger")]);
    invoiceProfile = companyResult.status === "fulfilled" ? companyResult.value || {} : {};
    companyCurrency = invoiceProfile.cmp_currency || "INR";
    invoiceBanks = ledgerResult.status === "fulfilled"
      ? ledgerResult.value.filter(ledger=>ledger.accountType === "Bank" || ledger.systemDefaultKey === "bank")
      : [];
    if(companyResult.status === "rejected") window.showToast?.("Could not load company currency; using INR.");
    applyCompanyCurrency();
  }

  function refreshCompanyCurrency(){
    if(companySettingsError){
      feedback.textContent=companySettingsError.message||"Could not load company settings.";
      feedback.hidden=false;
    }
    applyCompanyCurrency();
  }

  async function refreshTransactionContext(){
    const [companyResult,ledgerResult]=await Promise.allSettled([getCompany(),listRecords("ledger")]);
    if(companyResult.status==="fulfilled") companyCurrency=companyResult.value?.cmp_currency||"INR";
    else window.showToast?.("Could not load company currency; using INR.");
    if(ledgerResult.status==="fulfilled"){
      lookups.ledger=config.transactionLedgerPartyMode?ledgerResult.value:transactionLedgers(ledgerResult.value);
      const accountSelect=form.elements.account;
      const selected=accountSelect.value;
      const paymentLedgerOptions = config.transactionLedgerPartyMode
        ? lookups.ledger.filter(ledger=>["cash","bank"].includes(String(ledger.systemDefaultKey||ledger.accountType||"").toLowerCase()))
        : lookups.ledger;
      accountSelect.innerHTML=`<option value="">Select ${config.transactionTypeFilter==="Receipt"?"receipt":"payment"} mode</option>${paymentLedgerOptions.map(ledger=>`<option value="${escapeHtml(ledger.id)}">${escapeHtml(ledger.name||ledger.accountType||ledger.id)}</option>`).join("")}`;
      if(paymentLedgerOptions.some(ledger=>ledger.id===selected)) accountSelect.value=selected;
    }else{
      feedback.textContent=ledgerResult.reason?.message||"Could not load Cash and Bank ledgers.";
      feedback.hidden=false;
    }
    if(companyResult.status==="fulfilled") invoiceProfile=companyResult.value||{};
    applyCompanyCurrency();
  }

  function getClientForSale(record){
    return lookups.clients.find(client=>client.id === record.clientId) || lookups.clients.find(client=>client.name === record.customer) || null;
  }

  function getSaleMessage(record,client){
    return invoiceMessage({sale:record,customer:client,company:invoiceProfile});
  }

  function syncTransactionPartyContacts(){
    if(moduleName!=="transactions") return;
    if(config.transactionLedgerPartyMode){
      const ledger = lookups.ledger.find(item=>item.id===form.elements.party.value);
      form.elements.partyEmail.value = ledger?.email || "";
      form.elements.partyPhone.value = ledger?.phone || "";
      return;
    }
    const partyCollection=form.elements.partyType.value==="Supplier"?"suppliers":"clients";
    const party=lookups[partyCollection].find(item=>item.id===form.elements.party.value);
    if(!party){
      if(!form.elements.party.value){
        form.elements.partyEmail.value="";
        form.elements.partyPhone.value="";
      }
      return;
    }
    form.elements.partyEmail.value=party.email||"";
    form.elements.partyPhone.value=party.phone||"";
  }

  function syncTransactionPartyOptions(selectedId=form.elements.party.value){
    if(moduleName!=="transactions") return;
    const partySelect=form.elements.party;
    if(config.transactionLedgerPartyMode){
      const selected=lookups.ledger.find(item=>item.id===selectedId);
      partySelect.closest(".form-group").querySelector("label").textContent=config.transactionTypeFilter==="Receipt"?"Received From":"Given to";
      partySelect.innerHTML=`<option value="">Select ledger</option>${lookups.ledger.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name||item.id)}</option>`).join("")}`;
      if(selected) partySelect.value=selected.id;
      syncTransactionPartyContacts();
      return;
    }
    const collectionName=form.elements.partyType.value==="Supplier"?"suppliers":"clients";
    const selected=lookups[collectionName].find(item=>item.id===selectedId);
    partySelect.closest(".form-group").querySelector("label").textContent=collectionName==="suppliers"?"Supplier":"Client";
    partySelect.innerHTML=`<option value="">Select ${collectionName==="suppliers"?"supplier":"client"}</option>${lookups[collectionName].map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name||item.id)}</option>`).join("")}`;
    if(selected) partySelect.value=selected.id;
    syncTransactionPartyContacts();
  }

  function syncTransactionPartyType(){
    if(moduleName!=="transactions") return;
    if(config.transactionLedgerPartyMode){
      form.elements.partyType.value = config.transactionTypeFilter==="Receipt"?"Client":"Supplier";
      form.elements.partyType.disabled = true;
      syncTransactionPartyOptions("");
      return;
    }
    const partyType=form.elements.partyType;
    const transactionType=form.elements.type.value;
    const allowedType=transactionType==="Receipt"?"Client":transactionType==="Payment"?"Supplier":"";
    if(allowedType&&partyType.value!==allowedType) partyType.value=allowedType;
    partyType.disabled=Boolean(allowedType);
    syncTransactionPartyOptions("");
  }

  async function openSaleInvoice(record,client,popup){
    const template=invoiceProfile.invoiceTemplate||{};
    const selectedBank=invoiceBanks.find(bank=>bank.id===template.billingBankId)||(invoiceBanks.length===1?invoiceBanks[0]:null);
    if(template.showBankDetails!==false&&invoiceBanks.length>1&&!selectedBank){
      popup?.close();
      window.showToast?.("Select the billing bank in Invoice Template first.");
      return;
    }
    if(!popup){
      window.showToast?.("Allow pop-ups to open or save the bill PDF.");
      return;
    }
    let logoDataUrl=companyLogoSource(invoiceProfile);
    if(invoiceProfile.cmp_logo&&!logoDataUrl){
      try{logoDataUrl=await blobToDataUrl(await getCompanyLogoBlob(invoiceProfile.cmp_logo));}
      catch{window.showToast?.("Could not load the company logo; the invoice will use company details only.");}
    }
    const saleWithHsn={
      ...record,
      items:(record.items||[]).map(item=>({
        ...item,
        hsnCode:item.hsnCode||(item.itemType==="Product"?lookups.products.find(product=>product.id===item.itemId)?.hsnCode:"")||""
      }))
    };
    const html=createInvoiceHtml({sale:saleWithHsn,customer:client,company:invoiceProfile,bank:selectedBank,template,logoDataUrl,autoPrint:true});
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  async function openTransactionReceipt(record,popup){
    let logoDataUrl=companyLogoSource(invoiceProfile);
    if(invoiceProfile.cmp_logo&&!logoDataUrl){
      try{logoDataUrl=await blobToDataUrl(await getCompanyLogoBlob(invoiceProfile.cmp_logo));}
      catch{window.showToast?.("Could not load the company logo; receipt will use company details only.");}
    }
    const account=lookups.ledger.find(ledger=>ledger.id===record.account);
    const html=createTransactionReceiptHtml({
      transaction:record,
      company:invoiceProfile,
      paymentMode:account?.name||record.account||"",
      logoDataUrl,
      template:record.type==="Receipt"?invoiceProfile.receiptTemplate||{}:{},
      autoPrint:true
    });
    if(!popup){
      window.showToast?.("Allow pop-ups to open or save the transaction receipt.");
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  async function refreshLookups(){
    const collections = [...new Set([...config.fields.filter(field=>field.lookup).map(field=>field.lookup),...(config.salesWorkflow||config.purchaseWorkflow?["products","services"]:[]),...(moduleName==="transactions"?["suppliers"]:[])])];
    const results = await Promise.allSettled(collections.map(collectionName=>listRecords(collectionName)));
    const errors = [];
    results.forEach((result,index)=>{
      const collectionName = collections[index];
      if(result.status === "fulfilled"){
        lookups[collectionName] = moduleName==="transactions"&&collectionName==="ledger"
          ? config.transactionLedgerPartyMode?result.value:transactionLedgers(result.value)
          : ["services","products"].includes(collectionName)
            ? result.value.filter(service=>String(service.status||"Active").toLowerCase()!=="inactive")
            : result.value;
      }
      else errors.push(collectionName);
      config.fields.filter(field=>field.lookup === collectionName).forEach(field=>{
        const filteredRecords=field.lookupFilter==="sales-ledger"
          ? lookups[collectionName].filter(record=>["income","sales"].includes(String(record.category||"").toLowerCase())||String(record.name||"").toLowerCase().includes("sales"))
          : field.lookupFilter==="purchase-ledger"
            ? lookups[collectionName].filter(record=>["expenses","expense","purchase","purchases"].includes(String(record.category||"").toLowerCase())||/purchase|cost of goods/i.test(String(record.name||"")))
          : field.lookupFilter==="purchase-party-ledger"
            ? lookups[collectionName].filter(record=>["cash","bank"].includes(String(record.systemDefaultKey||record.accountType||"").toLowerCase())||record.systemDefaultKey==="sundry-creditors")
          : field.lookupFilter==="cash-bank-ledger"
            ? lookups[collectionName].filter(record=>["cash","bank"].includes(String(record.systemDefaultKey||record.accountType||"").toLowerCase()))
            : lookups[collectionName];
        const options = filteredRecords.map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || record.title || record.id)}</option>`).join("");
        const select = form.elements[field.key];
        select.innerHTML = `<option value="">Select ${escapeHtml(field.label.toLowerCase())}</option>${options}`;
      });
    });
    if(config.salesWorkflow||config.purchaseWorkflow){
      if(!saleItemsList.children.length) setSaleItems([{}]);
      else saleItemsList.querySelectorAll(".sale-item-row").forEach(row=>{
        const selected=row.querySelector(".sale-item-select").value;
        const options=saleItemRecords(row.querySelector(".sale-item-type").value);
        row.querySelector(".sale-item-select").innerHTML=`<option value="">Select item</option>${options.map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name||record.id)}</option>`).join("")}`;
        if(options.some(record=>record.id===selected)) row.querySelector(".sale-item-select").value=selected;
      });
      syncSalePartyFields();
      syncPurchasePartyFields();
      calculateSaleTotals();
    }
    renderFilterOptions();
    renderRows();
    if(errors.length){
      feedback.textContent = `Could not load ${errors.join(" and ")} for the required dropdowns.`;
      feedback.hidden = false;
    }
  }

  function renderFilterOptions(){
    const filter = document.getElementById("crudFilter");
    const selected = filter.value;
    const values = [...new Set(records.map(record=>String(record[filterField.key] ?? "").trim()).filter(Boolean))].sort((left,right)=>left.localeCompare(right));
    filter.innerHTML = `<option value="">All ${escapeHtml(config.title.toLowerCase())}</option>${values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(getFieldValue({[filterField.key]:value},filterField,lookups))}</option>`).join("")}`;
    filter.value = values.includes(selected) ? selected : "";
  }

  function renderRows(){
    const query = document.getElementById("crudSearch").value.trim().toLowerCase();
    const filterValue = document.getElementById("crudFilter").value;
    const sortOrder = document.getElementById("crudSort").value;
    const dateFrom = document.getElementById("crudDateFrom").value;
    const dateTo = document.getElementById("crudDateTo").value;
    const visible = records.filter(record=>
      (!filterValue || String(record[filterField.key] ?? "") === filterValue) &&
      (!dateFrom || getRecordDate(record) >= dateFrom) &&
      (!dateTo || getRecordDate(record) <= dateTo) &&
      (String(record.documentNo || "").toLowerCase().includes(query) || String(record.partyName||"").toLowerCase().includes(query) || config.fields.some(field=>String(getFieldValue(record,field,lookups)).toLowerCase().includes(query)) || (record.items||[]).some(item=>String(item.description||"").toLowerCase().includes(query)))
    );
    visible.sort((left,right)=>{
      if(config.ledgerModule&&(sortOrder==="head-asc"||sortOrder==="head-desc")){
        const comparison=String(left.category||"").localeCompare(String(right.category||""))||String(left.name||"").localeCompare(String(right.name||""));
        return sortOrder==="head-asc"?comparison:-comparison;
      }
      if(sortOrder.startsWith("date-")){
        const comparison = getRecordDate(left).localeCompare(getRecordDate(right));
        return sortOrder === "date-asc" ? comparison : -comparison;
      }
      if(sortOrder.startsWith("field-")){
        const comparison = String(left[filterField.key] ?? "").localeCompare(String(right[filterField.key] ?? ""));
        return sortOrder === "field-asc" ? comparison : -comparison;
      }
      const getTime = record=>{
        const value = record.date || record.updatedAt || record.createdAt;
        if(value?.toMillis) return value.toMillis();
        const time = value ? new Date(value).getTime() : 0;
        return Number.isNaN(time) ? 0 : time;
      };
      const leftTime = getTime(left);
      const rightTime = getTime(right);
      return sortOrder === "updated-asc" ? leftTime-rightTime : rightTime-leftTime;
    });
    if(!visible.length){
      rows.innerHTML = `<tr><td colspan="${tableColumnCount}"><div class="empty"><span class="material-symbols-rounded">${records.length ? "search_off" : "inbox"}</span><p>${records.length ? "No matching records." : `No ${config.title.toLowerCase()} found.`}</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      return;
    }
    rows.innerHTML = visible.map(record=>config.ledgerModule
      ? `<tr><td><strong>${escapeHtml(record.documentNo||record.id||"--")}</strong></td><td>${escapeHtml(record.name||"--")}</td><td><span class="ledger-head-badge">${escapeHtml(record.category||"--")}</span></td><td>${escapeHtml(record.accountType||"Other")}</td><td>${escapeHtml(formatCurrency(Math.abs(Number(record.openingBalance)||0),companyCurrency))}</td><td class="ledger-balance">${escapeHtml(formatCurrency(Math.abs(Number(record.currentBalance)||0),companyCurrency))}</td><td><span class="ledger-balance-type">${getLedgerBalanceType(record.balanceType,record.currentBalance)}</span></td><td><button class="icon-button ledger-view-button" type="button" data-action="view-ledger" data-id="${escapeHtml(record.id)}" aria-label="View ${escapeHtml(record.name||"ledger")} details" title="View ledger details"><span class="material-symbols-rounded">visibility</span></button></td></tr>`
      : moduleName==="branches"
      ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td><td>${escapeHtml(record.name||"--")}</td><td class="branch-address-cell">${escapeHtml(branchAddress(record))}</td><td>${escapeHtml(record.email||"--")}</td><td>${escapeHtml(record.phone||"--")}</td><td><button class="icon-button branch-view-button" type="button" data-action="view-branch" data-id="${escapeHtml(record.id)}" aria-label="View full branch details for ${escapeHtml(record.name||"branch")}" title="View full branch details"><span class="material-symbols-rounded">open_in_full</span></button></td></tr>`
      : config.clientModule
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td><td><strong class="client-name">${escapeHtml(record.name||"--")}</strong>${record.contactPerson?`<small class="client-contact-person">${escapeHtml(record.contactPerson)}</small>`:""}</td><td>${escapeHtml(record.email||"--")}</td><td>${escapeHtml(record.phone||"--")}</td><td class="client-balance">${escapeHtml(formatCurrency(record.openingBalance||0,companyCurrency))}</td><td class="client-balance${Number(record.receivableBalance)<0?" is-credit":""}">${escapeHtml(formatCurrency(record.receivableBalance??record.openingBalance??0,companyCurrency))}</td><td><span class="client-status${String(record.status||"Active").toLowerCase()==="active"?" is-active":""}">${escapeHtml(record.status||"Active")}</span></td><td><details class="inventory-row-menu"><summary class="icon-button" aria-label="Client actions for ${escapeHtml(record.name||"client")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit client</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete client</button></div></details></td></tr>`
      : config.supplierModule
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td><td><strong class="client-name">${escapeHtml(record.name||"--")}</strong>${record.contactPerson?`<small class="client-contact-person">${escapeHtml(record.contactPerson)}</small>`:""}</td><td>${escapeHtml(record.email||"--")}</td><td>${escapeHtml(record.phone||"--")}</td><td class="client-balance">${escapeHtml(formatCurrency(record.openingBalance||0,companyCurrency))}</td><td class="client-balance">${escapeHtml(formatCurrency(record.payableBalance??record.openingBalance??0,companyCurrency))}</td><td><span class="client-status${String(record.status||"Active").toLowerCase()==="active"?" is-active":""}">${escapeHtml(record.status||"Active")}</span></td><td><details class="inventory-row-menu"><summary class="icon-button" aria-label="Supplier actions for ${escapeHtml(record.name||"supplier")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit supplier</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete supplier</button></div></details></td></tr>`
      : config.salesWorkflow
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td><td>${escapeHtml(formatDate(record.date))}</td><td>${escapeHtml(record.salesLedgerName||getFieldValue(record,{key:"salesLedgerId",lookup:"ledger"},lookups)||"--")}</td><td>${escapeHtml(record.partyName||record.clientName||record.partyLedgerName||record.partyType||"--")}${record.reference?`<small class="sale-reference">Ref: ${escapeHtml(record.reference)}</small>`:""}</td><td>${escapeHtml(formatCurrency(record.total||0,companyCurrency))}</td><td><details class="inventory-row-menu"><summary class="icon-button" aria-label="Sale actions for ${escapeHtml(record.documentNo||"sale")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit</button><button type="button" data-action="invoice-email" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">email</span>Email Bill</button><button type="button" data-action="invoice-whatsapp" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">chat</span>WhatsApp Bill</button><button type="button" data-action="invoice-pdf" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">picture_as_pdf</span>Bill PDF</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete</button></div></details></td></tr>`
      : config.purchaseWorkflow
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td><td>${escapeHtml(formatDate(record.date))}</td><td>${escapeHtml(record.purchaseLedgerName||getFieldValue(record,{key:"purchaseLedgerId",lookup:"ledger"},lookups)||"--")}</td><td>${escapeHtml(record.partyName||record.supplierName||record.supplier||record.partyLedgerName||record.partyType||"--")}${record.reference?`<small class="sale-reference">Ref: ${escapeHtml(record.reference)}</small>`:""}</td><td>${escapeHtml(formatCurrency(record.total??record.amount??0,companyCurrency))}</td><td><details class="inventory-row-menu"><summary class="icon-button" aria-label="Purchase actions for ${escapeHtml(record.documentNo||"purchase")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete</button></div></details></td></tr>`
      : config.categoryModule
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td>${config.tableFields.map(field=>`<td>${escapeHtml(getDisplayValue(record,field,lookups,companyCurrency))}</td>`).join("")}<td><details class="inventory-row-menu"><summary class="icon-button" aria-label="Category actions for ${escapeHtml(record.name||"category")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete</button></div></details></td></tr>`
      : config.inventorySingular
        ? `<tr><td>${escapeHtml(record.documentNo||record.id||"--")}</td>${config.tableFields.map(field=>`<td>${escapeHtml(getDisplayValue(record,field,lookups,companyCurrency))}</td>`).join("")}<td><details class="inventory-row-menu"><summary class="icon-button" aria-label="${escapeHtml(config.inventorySingular)} actions for ${escapeHtml(record.name||"record")}" title="Actions"><span class="material-symbols-rounded">more_vert</span></summary><div class="inventory-row-menu-panel"><button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">edit</span>Edit</button><button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><span class="material-symbols-rounded">delete</span>Delete</button></div></details></td></tr>`
        : `<tr><td>${escapeHtml(record.documentNo || "--")}</td>${config.tableFields.map(field=>`<td>${escapeHtml(getDisplayValue(record,field,lookups,companyCurrency))}</td>`).join("")}<td>${formatDate(dateField ? record.updatedAt || record.createdAt : record.date || record.createdAt || record.updatedAt)}</td><td><div class="crud-row-actions"><button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit record"><span class="material-symbols-rounded">edit</span></button>${moduleName === "sales" ? `<button class="icon-button" type="button" data-action="invoice-email" data-id="${escapeHtml(record.id)}" aria-label="Email bill" title="Email bill"><span class="material-symbols-rounded">email</span></button><button class="icon-button" type="button" data-action="invoice-whatsapp" data-id="${escapeHtml(record.id)}" aria-label="Send bill with WhatsApp" title="Send bill with WhatsApp"><span class="material-symbols-rounded">chat</span></button><button class="icon-button" type="button" data-action="invoice-pdf" data-id="${escapeHtml(record.id)}" aria-label="Download bill PDF" title="Download bill PDF"><span class="material-symbols-rounded">picture_as_pdf</span></button>` : ""}${moduleName === "transactions" ? `<button class="icon-button" type="button" data-action="transaction-email" data-id="${escapeHtml(record.id)}" aria-label="Email receipt" title="Email receipt"><span class="material-symbols-rounded">email</span></button><button class="icon-button" type="button" data-action="transaction-whatsapp" data-id="${escapeHtml(record.id)}" aria-label="Send receipt with WhatsApp" title="Send receipt with WhatsApp"><span class="material-symbols-rounded">chat</span></button><button class="icon-button" type="button" data-action="transaction-pdf" data-id="${escapeHtml(record.id)}" aria-label="Download receipt" title="Download receipt"><span class="material-symbols-rounded">picture_as_pdf</span></button>` : ""}${record.systemDefault ? "" : `<button class="icon-button crud-delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete record"><span class="material-symbols-rounded">delete</span></button>`}</div></td></tr>`).join("");
    window.COREBIQ?.renderIcons(rows);
  }

  function showBranchDetails(record){
    if(!branchDetailsDialog) return;
    document.getElementById("branchDetailsTitle").textContent=record.name||"Branch details";
    const details=[
      `<div class="branch-detail-item"><span>Branch ID</span><strong>${escapeHtml(record.documentNo||record.id||"--")}</strong></div>`,
      ...config.fields.map(field=>{
        const value=getDisplayValue(record,field,lookups,companyCurrency);
        return `<div class="branch-detail-item"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
      })
    ];
    document.getElementById("branchDetailsContent").innerHTML=`<div class="branch-details-grid">${details.join("")}</div>`;
    branchDetailsDialog.dataset.recordId=record.id;
    branchDetailsDialog.showModal();
    window.COREBIQ?.renderIcons(branchDetailsDialog);
  }

  function showLedgerDetails(record){
    if(!ledgerDetailsDialog) return;
    const currentBalance=Number(record.currentBalance)||0;
    const openingBalance=Number(record.openingBalance)||0;
    const details=[
      ["Ledger ID",record.documentNo||record.id||"--"],
      ["Ledger name",record.name||"--"],
      ["Under",record.category||"--"],
      ["Account type",record.accountType||"Other"],
      ["Opening balance",`${formatCurrency(Math.abs(openingBalance),companyCurrency)} ${getLedgerBalanceType(record.balanceType,openingBalance)}`],
      ["Current balance",`${formatCurrency(Math.abs(currentBalance),companyCurrency)} ${getLedgerBalanceType(record.balanceType,currentBalance)}`],
      ["Balance type",getLedgerBalanceType(record.balanceType,currentBalance)]
    ];
    if(record.accountType==="Bank"){
      details.push(["Bank name",record.bankName||"--"],["Account holder",record.accountHolderName||"--"],["Account number",record.accountNumber||"--"],["IFSC code",record.ifsc||"--"],["Bank branch",record.bankBranch||"--"]);
    }
    if(record.notes) details.push(["Notes",record.notes]);
    document.getElementById("ledgerDetailsTitle").textContent=record.name||"Ledger details";
    document.getElementById("ledgerDetailsContent").innerHTML=`<div class="ledger-details-grid">${details.map(([label,value])=>`<div class="ledger-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
    ledgerDetailsDialog.dataset.recordId=record.id;
    document.getElementById("ledgerDetailsDelete").hidden=Boolean(record.systemDefault);
    ledgerDetailsDialog.showModal();
    window.COREBIQ?.renderIcons(ledgerDetailsDialog);
  }

  async function deleteLedgerRecord(record,button){
    if(!window.confirm(`Delete ledger "${record.name||"this account"}"?`)) return;
    if(button) button.disabled=true;
    try{
      await deleteRecord(moduleName,record.id);
      records=records.filter(item=>item.id!==record.id);
      renderFilterOptions();
      renderRows();
      window.showToast?.("Ledger deleted.");
    }catch(error){
      if(button) button.disabled=false;
      window.showToast?.(error.message||"Could not delete ledger.");
    }
  }

  async function deleteBranch(record,button){
    const branchName=record.name||"this branch";
    if(!window.confirm(`Delete branch "${branchName}"?`)) return false;
    if(!window.confirm(`Confirm permanent deletion of "${branchName}" (${record.documentNo||record.id}). This cannot be undone.`)) return false;
    if(button) button.disabled=true;
    try{
      await deleteRecord(moduleName,record.id);
      records=records.filter(item=>item.id!==record.id);
      branchDetailsDialog?.close();
      renderFilterOptions();
      renderRows();
      window.showToast?.("Branch deleted.");
      return true;
    }catch(error){
      if(button) button.disabled=false;
      window.showToast?.(error.message||"Could not delete branch.");
      return false;
    }
  }

  async function refresh(){
    feedback.hidden = true;
    rows.innerHTML = `<tr><td colspan="${tableColumnCount}"><div class="loader" role="status" aria-label="Loading"><span class="loading-ring" aria-hidden="true"></span></div></td></tr>`;
    try{
      records = await listRecords(moduleName);
      if(config.transactionTypeFilter) records=records.filter(record=>record.type===config.transactionTypeFilter);
      renderFilterOptions();
      renderRows();
    }catch(error){
      records = [];
      rows.innerHTML = `<tr><td colspan="${tableColumnCount}"><div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load ${config.title.toLowerCase()} from Firebase.</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      feedback.textContent = error.message || "Check your Firebase configuration and Firestore access rules.";
      feedback.hidden = false;
    }
  }

  function openEditor(record){
    form.querySelectorAll('option[data-existing-option="true"]').forEach(option=>option.remove());
    form.reset();
    if(moduleName==="transactions") form.elements.partyType.disabled=false;
    form.elements.recordId.value = record?.id || "";
    form.elements.displayDocumentNo.value = record?.documentNo || "Assigned on save";
    const protectedLedger = moduleName === "ledger" && record?.systemDefault === true;
    const editablePresetFields = record?.systemDefaultKey === "bank"
      ? new Set(["openingBalance","bankName","accountHolderName","accountNumber","ifsc","bankBranch"])
      : new Set(["openingBalance"]);
    config.fields.filter(field=>!field.tableOnly).forEach(field=>{
      const input = form.elements[field.key];
      const legacyValue = field.lookup === "clients" ? record?.customer : field.lookup === "branches" ? record?.branch : "";
      const rawValue = moduleName==="transactions"&&field.key==="party"
        ? record?.partyId??record?.party??""
        : moduleName==="transactions"&&field.key==="partyType"
          ? record?.partyType||(record?.type==="Payment"?"Supplier":"Client")
        : record?.[field.key] ?? (field.lookup ? legacyValue : field.defaultValue) ?? "";
      const match = field.lookup && lookups[field.lookup].find(item=>item.id === rawValue || item.name === rawValue);
      const value = match?.id ?? rawValue;
      if(field.type==="select"&&value&&!Array.from(input.options).some(option=>option.value===String(value))){
        const option=document.createElement("option");
        option.value=value;
        option.textContent=`${value} (existing value)`;
        option.dataset.existingOption="true";
        input.append(option);
      }
      if(field.lookup && value && !lookups[field.lookup].some(item=>item.id === value)){
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${rawValue} (existing value)`;
        input.append(option);
      }
      input.value = value;
      input.disabled = protectedLedger && !editablePresetFields.has(field.key);
      const fieldGroup = input.closest(".form-group");
      if(field.bankOnly){
        fieldGroup.hidden = Boolean(field.hidden)||form.elements.accountType?.value !== "Bank";
      }else{
        fieldGroup.hidden = Boolean(field.hidden)||(protectedLedger && !editablePresetFields.has(field.key) && !["name","category"].includes(field.key));
      }
    });
    if(config.salesWorkflow||config.purchaseWorkflow){
      syncSalePartyFields();
      syncPurchasePartyFields();
      const items=record?.items?.length?record.items.map(item=>({...item,itemType:item.itemType||"Service",itemId:item.itemId||item.serviceId})):record?.serviceId?[{itemType:"Service",itemId:record.serviceId,description:record.description,quantity:record.quantity||1,rate:record.rate||0}]:[{}];
      setSaleItems(items);
      if(!record) form.elements.date.value=todayInputValue();
    }
    if(moduleName==="transactions"){
      syncTransactionPartyOptions(record?.partyId||record?.party||"");
      form.elements.partyType.disabled=Boolean(form.elements.type.value);
      syncTransactionPartyType();
    }
    syncTransactionPartyContacts();
    document.getElementById("crudDialogTitle").textContent = `${record ? "Edit" : "Add"} ${config.singular || config.title.replace(/s$/,"")}`;
    dialog.showModal();
  }

  document.getElementById("crudCreate").addEventListener("click",()=>openEditor(null));
  if(config.salesWorkflow||config.purchaseWorkflow){
    form.elements.partyType.addEventListener("change",syncSalePartyFields);
    if(config.purchaseWorkflow) form.elements.partyType.addEventListener("change",syncPurchasePartyFields);
    document.getElementById("saleAddItem").addEventListener("click",()=>{
      saleItemsList.append(makeSaleItemRow());
      setSaleItems([...saleItemsList.querySelectorAll(".sale-item-row")].map(row=>({
        itemType:row.querySelector(".sale-item-type").value,
        itemId:row.querySelector(".sale-item-select").value,
        quantity:row.querySelector(".sale-item-quantity").value,
        rate:row.querySelector(".sale-item-rate").value
      })));
    });
  }
  if(moduleName==="transactions"){
    form.elements.party.addEventListener("change",syncTransactionPartyContacts);
    form.elements.partyType.addEventListener("change",()=>syncTransactionPartyOptions(""));
    form.elements.type.addEventListener("change",syncTransactionPartyType);
  }
  if(moduleName === "ledger"){
    const syncBankFields=()=>{
      const showBankDetails = form.elements.accountType.value === "Bank";
      form.querySelectorAll(".crud-bank-field").forEach(field=>{ field.hidden = !showBankDetails; });
    };
    form.elements.accountType.addEventListener("change",syncBankFields);
    syncBankFields();
  }
  document.getElementById("crudRefresh").addEventListener("click",refresh);
  document.getElementById("crudSearch").addEventListener("input",renderRows);
  document.getElementById("crudFilter").addEventListener("change",renderRows);
  document.getElementById("crudSort").addEventListener("change",renderRows);
  document.getElementById("crudDateFrom").addEventListener("change",renderRows);
  document.getElementById("crudDateTo").addEventListener("change",renderRows);
  document.getElementById("compactClearFilters")?.addEventListener("click",()=>{
    document.getElementById("crudFilter").value="";
    document.getElementById("crudSort").value="updated-desc";
    document.getElementById("crudDateFrom").value="";
    document.getElementById("crudDateTo").value="";
    renderRows();
  });
  document.getElementById("branchDetailsClose")?.addEventListener("click",()=>branchDetailsDialog.close());
  document.getElementById("branchDetailsEdit")?.addEventListener("click",()=>{
    const record=records.find(item=>item.id===branchDetailsDialog.dataset.recordId);
    if(!record) return;
    branchDetailsDialog.close();
    openEditor(record);
  });
  document.getElementById("branchDetailsDelete")?.addEventListener("click",()=>{
    const record=records.find(item=>item.id===branchDetailsDialog.dataset.recordId);
    if(record) void deleteBranch(record,document.getElementById("branchDetailsDelete"));
  });
  document.getElementById("ledgerDetailsClose")?.addEventListener("click",()=>ledgerDetailsDialog.close());
  document.getElementById("ledgerDetailsEdit")?.addEventListener("click",()=>{
    const record=records.find(item=>item.id===ledgerDetailsDialog.dataset.recordId);
    if(!record) return;
    ledgerDetailsDialog.close();
    openEditor(record);
  });
  document.getElementById("ledgerDetailsDelete")?.addEventListener("click",()=>{
    const record=records.find(item=>item.id===ledgerDetailsDialog.dataset.recordId);
    if(!record) return;
    ledgerDetailsDialog.close();
    void deleteLedgerRecord(record,document.getElementById("ledgerDetailsDelete"));
  });
  document.getElementById("branchCardDownload")?.addEventListener("click",()=>{
    const record=records.find(item=>item.id===branchDetailsDialog.dataset.recordId);
    if(!record) return;
    const popup=window.open("about:blank","_blank");
    if(!popup){
      window.showToast?.("Allow pop-ups to download or print the branch card.");
      return;
    }
    popup.document.open();
    popup.document.write(branchCardHtml(record));
    popup.document.close();
  });
  document.getElementById("crudExportCsv").addEventListener("click",()=>{
    const csvEscape = value=>{
      const safeValue = /^[=+\-@]/.test(String(value)) ? `'${value}` : String(value);
      return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g,'""')}"` : safeValue;
    };
    const rowAction=moduleName==="branches"?"view-branch":"edit";
    const visibleRecords = [...rows.querySelectorAll(`[data-action="${rowAction}"]`)].map(button=>records.find(record=>record.id === button.dataset.id)).filter(Boolean);
    const csv = config.salesWorkflow
      ? [["Sales ID","Date","Sale Ledger","Party","Reference No.","Items","Subtotal","Tax","Total","Notes"],...visibleRecords.map(record=>[record.documentNo,record.date,record.salesLedgerName,record.partyName,record.reference,(record.items||[]).map(item=>`${item.description} x ${item.quantity}`).join("; "),record.subtotal,record.taxAmount,record.total,record.notes])].map(row=>row.map(csvEscape).join(",")).join("\r\n")
      : config.purchaseWorkflow
        ? [["Purchase ID","Date","Purchase Ledger","Supplier / Account","Reference No.","Items","Subtotal","Tax","Total","Notes"],...visibleRecords.map(record=>[record.documentNo,record.date,record.purchaseLedgerName,record.partyName,record.reference,(record.items||[]).map(item=>`${item.description} x ${item.quantity}`).join("; "),record.subtotal,record.taxAmount,record.total,record.notes])].map(row=>row.map(csvEscape).join(",")).join("\r\n")
        : [[documentIdLabel,...config.fields.map(field=>`${field.label}${CURRENCY_FIELDS.has(field.key)?` (${companyCurrency})`:""}`)],...visibleRecords.map(record=>[record.documentNo,...config.fields.map(field=>getFieldValue(record,field,lookups))])].map(row=>row.map(csvEscape).join(",")).join("\r\n");
    const blobUrl = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const download = document.createElement("a");
    download.href = blobUrl;
    download.download = `${moduleName}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
    actionsMenu.open=false;
  });
  document.getElementById("crudExportPdf").addEventListener("click",()=>{
    const rowAction=moduleName==="branches"?"view-branch":"edit";
    const visibleRecords = [...rows.querySelectorAll(`[data-action="${rowAction}"]`)];
    document.getElementById("crudPrintCount").textContent = `${visibleRecords.length} records`;
    document.getElementById("crudPrintDate").textContent = `Generated ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date())}`;
    actionsMenu.open=false;
    window.print();
  });
  document.getElementById("crudCancel").addEventListener("click",()=>dialog.close());
  document.getElementById("crudClose").addEventListener("click",()=>dialog.close());
  rows.addEventListener("click",async event=>{
    const button = event.target.closest("[data-action]");
    if(!button) return;
    const record = records.find(item=>item.id === button.dataset.id);
    if(!record) return;
    if(button.dataset.action==="view-ledger"){
      showLedgerDetails(record);
      return;
    }
    if(button.dataset.action==="view-branch"){
      showBranchDetails(record);
      return;
    }
    if(["transaction-email","transaction-whatsapp","transaction-pdf"].includes(button.dataset.action)){
      const account=lookups.ledger.find(ledger=>ledger.id===record.account);
      const message=transactionMessage({transaction:{...record,accountName:account?.name||record.account},company:invoiceProfile,currency:companyCurrency});
      if(button.dataset.action==="transaction-email"){
        if(!record.partyEmail){window.showToast?.("Add an email address to this transaction before emailing its receipt.");return;}
        const documentNo=record.documentNo||record.reference||"";
        const label=record.type==="Receipt"?"Receipt":"Payment";
        const subject=`${label} ${documentNo} from ${invoiceProfile.cmp_name||"COREBIQ"}`;
        window.open(`mailto:${encodeURIComponent(record.partyEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      if(button.dataset.action==="transaction-whatsapp"){
        const digits=String(record.partyPhone||"").replace(/\D/g,"").replace(/^0/,"");
        if(!digits){window.showToast?.("Add a phone number to this transaction before using WhatsApp.");return;}
        const phone=digits.length===10?`91${digits}`:digits;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      const popup=window.open("about:blank","_blank");
      await openTransactionReceipt(record,popup);
      return;
    }
    if(["invoice-email","invoice-whatsapp","invoice-pdf"].includes(button.dataset.action)){
      const client=getClientForSale(record);
      const message=getSaleMessage(record,client);
      if(button.dataset.action === "invoice-email"){
        if(!client?.email){window.showToast?.("Add an email address to this client before emailing the bill.");return;}
        const subject=`Bill ${record.documentNo||record.reference||""} from ${invoiceProfile.cmp_name||"COREBIQ"}`;
        window.open(`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      if(button.dataset.action === "invoice-whatsapp"){
        const digits=String(client?.phone||"").replace(/\D/g,"").replace(/^0/,"");
        if(!digits){window.showToast?.("Add a phone number to this client before using WhatsApp.");return;}
        const phone=digits.length===10?`91${digits}`:digits;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      const popup=window.open("about:blank","_blank");
      await openSaleInvoice(record,client,popup);
      return;
    }
    if(button.dataset.action === "delete" && record.systemDefault){
      window.showToast?.("System default ledgers cannot be deleted.");
      return;
    }
    if(button.dataset.action === "edit"){
      openEditor(record);
      return;
    }
    if(moduleName==="branches"){
      await deleteBranch(record,button);
      return;
    }
    if(config.ledgerModule){
      await deleteLedgerRecord(record,button);
      return;
    }
    if(!window.confirm(`Delete this ${(config.singular || config.title.replace(/s$/,"")).toLowerCase()} record?`)) return;
    button.disabled = true;
    try{
      if(config.salesWorkflow) await deleteSale(record.id);
      else if(config.purchaseWorkflow) await deletePurchase(record.id);
      else await deleteRecord(moduleName,record.id);
      records = records.filter(item=>item.id !== record.id);
      renderRows();
      window.showToast?.("Record deleted.");
    }catch(error){
      button.disabled = false;
      window.showToast?.(error.message || "Delete failed.");
    }
  });

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const saveButton = document.getElementById("crudSave");
    const recordId = form.elements.recordId.value;
    const data = {};
    config.fields.filter(field=>!field.tableOnly).forEach(field=>{
      const value = form.elements[field.key].value.trim();
      data[field.key] = field.type === "number" && value !== "" ? Number(value) : value;
    });
    if(config.clientModule){
      const openingBalance=Number(data.openingBalance);
      if(!Number.isFinite(openingBalance)){
        feedback.textContent="Enter a valid opening balance.";
        feedback.hidden=false;
        form.elements.openingBalance.focus();
        return;
      }
      data.openingBalance=openingBalance;
    }
    if(taxUnregistered) taxFieldKeys.forEach(key=>data[key]=0);
    if(config.salesWorkflow||config.purchaseWorkflow){
      const itemRows=[...saleItemsList.querySelectorAll(".sale-item-row")];
      if(!itemRows.length||itemRows.some(row=>!row.querySelector(".sale-item-select").value||Number(row.querySelector(".sale-item-quantity").value)<=0||!Number.isFinite(Number(row.querySelector(".sale-item-rate").value))||row.querySelector(".sale-item-rate").value==="")){
        feedback.textContent=`Select a product or service and enter a valid quantity and rate for every ${config.purchaseWorkflow?"purchase":"sale"} line.`;
        feedback.hidden=false;
        saleItemsList.querySelector(".sale-item-select")?.focus();
        return;
      }
      const totals=calculateSaleTotals();
      if(!totals.total){
        feedback.textContent=`The ${config.purchaseWorkflow?"purchase":"sale"} total must be greater than zero.`;
        feedback.hidden=false;
        return;
      }
      data.items=totals.items;
      data.subtotal=totals.subtotal;
      data.taxAmount=totals.taxAmount;
      data.total=totals.total;
      data.amount=totals.total;
      const partyLedger=lookups.ledger.find(item=>item.id===data.partyLedgerId);
      if(config.salesWorkflow){
        const client=lookups.clients.find(item=>item.id===data.clientId);
        data.partyName=data.partyType==="Sundry Debtors"?client?.name||"":`${data.partyType}${partyLedger?.name?` - ${partyLedger.name}`:""}`;
        data.clientName=client?.name||"";
        data.partyLedgerName=partyLedger?.name||"";
      }else{
        const supplier=lookups.suppliers.find(item=>item.id===data.supplierId);
        data.partyName=data.partyType==="Sundry Creditors"?supplier?.name||"":`${data.partyType}${partyLedger?.name?` - ${partyLedger.name}`:""}`;
        data.supplierName=supplier?.name||"";
        data.partyLedgerName=partyLedger?.name||"";
      }
    }
    if(moduleName==="transactions"){
      if(config.transactionLedgerPartyMode){
        const ledger=lookups.ledger.find(item=>item.id===data.party);
        if(!ledger){
          feedback.textContent=`Choose a valid ledger for ${config.transactionTypeFilter==="Receipt"?"the receipt source":"the payment recipient"}.`;
          feedback.hidden=false;
          form.elements.party.focus();
          return;
        }
        data.partyId=ledger.id;
        data.partyCollection="ledger";
        data.party=ledger.name||ledger.id;
      }else{
        const partyType=data.partyType==="Supplier"?"Supplier":"Client";
        const partyCollection=partyType==="Supplier"?"suppliers":"clients";
        const party=lookups[partyCollection].find(item=>item.id===data.party);
        if(!party||data.type==="Receipt"&&partyType!=="Client"||data.type==="Payment"&&partyType!=="Supplier"){
          feedback.textContent="Choose a client for a Receipt or a supplier for a Payment.";
          feedback.hidden=false;
          form.elements.party.focus();
          return;
        }
        data.partyId=party.id;
        data.partyCollection=partyCollection;
        data.party=party.name||party.id;
      }
    }
    saveButton.disabled = true;
    try{
      if(moduleName === "ledger" && !recordId && ["cash","bank"].includes(data.name.trim().toLowerCase())){
        throw new Error("Cash and Bank are preset ledgers. Edit the existing account instead.");
      }
      if(config.salesWorkflow){
        await saveSale(recordId||null,data);
        window.showToast?.(recordId?"Sale updated.":"Sale recorded.");
      }else if(config.purchaseWorkflow){
        await savePurchase(recordId||null,data);
        window.showToast?.(recordId?"Purchase updated.":"Purchase recorded.");
      }else if(recordId){
        await updateRecord(moduleName,recordId,data);
        window.showToast?.("Record updated.");
      }else{
        await createRecord(moduleName,data);
        window.showToast?.("Record created.");
      }
      dialog.close();
      await refresh();
    }catch(error){
      feedback.textContent = error.message || "Save failed. Check Firestore access rules.";
      feedback.hidden = false;
    }finally{
      saveButton.disabled = false;
    }
  });

  await Promise.all([refresh(),refreshLookups(),...(moduleName === "sales"?[refreshInvoiceContext()]:moduleName==="transactions"?[refreshTransactionContext()]:[refreshCompanyCurrency()])]);
}
