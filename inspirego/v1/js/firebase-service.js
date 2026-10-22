import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getBlob, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=6";

let db;
let auth;
let app;
const DOCUMENT_PREFIXES = {
  branches:"BRN",clients:"CLI",suppliers:"SUP",staff:"STF",products:"PRD","product-categories":"CAT","service-categories":"SCT",services:"SRV",
  sales:"SAL",purchases:"PUR",sales_returns:"SRT","purchase_returns":"PRT",estimates:"EST",contra_vouchers:"CTR",journal_vouchers:"JRN",invoices:"INV",expenses:"EXP",transactions:"TRN",
  payments:"PAY",qr:"QRC",reports:"RPT",settings:"SET",ledger:"LED",
  checkbooks:"CBK",cheques:"CHQ"
};
const COUNTER_DOCUMENT_ID = "_document_counter";
const DEFAULT_LEDGER_ACCOUNTS = [
  {key:"cash",id:"system_cash",name:"Cash",category:"Assets",accountType:"Cash",balanceType:"Debit"},
  {key:"bank",id:"system_bank",name:"Bank",category:"Assets",accountType:"Bank",balanceType:"Debit"},
  {key:"sundry-creditors",id:"system_sundry_creditors",name:"Sundry Creditors",category:"Liabilities",accountType:"Other",balanceType:"Credit"}
];

function getFirebaseApp(){
  if(!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

function getAuthClient(){
  if(!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function observeAuth(callback, onError){
  return onAuthStateChanged(getAuthClient(),callback,onError);
}

export async function signIn(email,password,remember=true){
  const authClient = getAuthClient();
  await setPersistence(authClient,remember ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(authClient,email,password);
}

export async function createAccount(email,password,name,remember=true){
  const authClient = getAuthClient();
  await setPersistence(authClient,remember ? browserLocalPersistence : browserSessionPersistence);
  const credential = await createUserWithEmailAndPassword(authClient,email,password);
  if(name?.trim()) await updateProfile(credential.user,{displayName:name.trim()});
  return credential;
}

export async function getAuthProfile(user=getAuthClient().currentUser){
  if(!user) return null;
  const token = await user.getIdTokenResult();
  const claims = token.claims || {};
  return {
    name:user.displayName || user.email?.split("@")[0] || "COREBIQ User",
    email:user.email || "",
    role:claims.role || claims.userRole || claims.user_role || (claims.admin ? "Admin" : "User")
  };
}

export async function getAppLicense(user=getAuthClient().currentUser){
  if(!user) return null;
  const snapshot = await getDoc(doc(initFirebase(),"app_licenses",user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function resetPassword(email){
  return sendPasswordResetEmail(getAuthClient(),email);
}

export async function signOutUser(){
  return signOut(getAuthClient());
}

export function initFirebase(){
  if(!db) db = getFirestore(getFirebaseApp());
  return db;
}

async function ensureDefaultLedgers(firestore,existingDocuments){
  const matchingDocuments = DEFAULT_LEDGER_ACCOUNTS.map(account=>existingDocuments.find(record=>
    record.data().systemDefaultKey === account.key || String(record.data().name || "").trim().toLowerCase() === account.key || String(record.data().name||"").trim().toLowerCase()===account.name.toLowerCase()
  ));
  const references = DEFAULT_LEDGER_ACCOUNTS.map((account,index)=>doc(firestore,"ledger",matchingDocuments[index]?.id || account.id));
  const counterReference = doc(firestore,"ledger",COUNTER_DOCUMENT_ID);
  const minimumNext = existingDocuments.reduce((next,record)=>{
    const match = String(record.data().documentNo || "").match(/^LED-(\d+)$/);
    return match ? Math.max(next,Number(match[1])+1) : next;
  },1);

  await runTransaction(firestore,async transaction=>{
    const [counterSnapshot,...accountSnapshots] = await Promise.all([
      transaction.get(counterReference),...references.map(reference=>transaction.get(reference))
    ]);
    let nextNumber = Math.max(Number(counterSnapshot.data()?.nextNumber) || 1,minimumNext);
    for(let index=0;index<DEFAULT_LEDGER_ACCOUNTS.length;index++){
      const account = DEFAULT_LEDGER_ACCOUNTS[index];
      const reference = references[index];
      const snapshot = accountSnapshots[index];
      if(snapshot.exists()){
        const current = snapshot.data();
          const protectedFields = {
          name:account.name,
          category:account.category,
          accountType:account.accountType,
          openingBalance:current.openingBalance ?? 0,
          balanceType:account.balanceType,
          systemDefault:true,
            systemDefaultKey:account.key
          };
          if(account.key === "bank") Object.assign(protectedFields,{bankName:current.bankName || "",accountHolderName:current.accountHolderName || "",accountNumber:current.accountNumber || "",ifsc:current.ifsc || "",bankBranch:current.bankBranch || ""});
          if(Object.entries(protectedFields).some(([key,value])=>current[key] !== value)) transaction.update(reference,protectedFields);
        continue;
      }
      const now = serverTimestamp();
      transaction.set(reference,{
        name:account.name,
        category:account.category,
        accountType:account.accountType,
        openingBalance:0,
        balanceType:account.balanceType,
        ...(account.key === "bank" ? {bankName:"",accountHolderName:"",accountNumber:"",ifsc:"",bankBranch:""} : {}),
        systemDefault:true,
        systemDefaultKey:account.key,
        documentNo:`LED-${String(nextNumber).padStart(5,"0")}`,
        createdAt:now,
        updatedAt:now
      });
      nextNumber++;
    }
    const currentNext = Number(counterSnapshot.data()?.nextNumber) || 1;
    if(!counterSnapshot.exists() || currentNext < nextNumber){
      transaction.set(counterReference,{nextNumber});
    }
  });
}

async function ensureDocumentCounterFloor(collectionName, minimumNext){
  const firestore = initFirebase();
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  await runTransaction(firestore,async transaction=>{
    const snapshot = await transaction.get(counterReference);
    const currentNext = Number(snapshot.data()?.nextNumber) || 1;
    if(currentNext < minimumNext) transaction.set(counterReference,{nextNumber:minimumNext});
  });
}

async function ensureRecordDocumentNumber(collectionName, recordId){
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix) return null;
  const firestore = initFirebase();
  const recordReference = doc(firestore,collectionName,recordId);
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  return runTransaction(firestore,async transaction=>{
    const [recordSnapshot,counterSnapshot] = await Promise.all([
      transaction.get(recordReference),transaction.get(counterReference)
    ]);
    if(!recordSnapshot.exists()) return null;
    const existingNumber = recordSnapshot.data().documentNo;
    if(existingNumber) return existingNumber;
    const nextNumber = Number(counterSnapshot.data()?.nextNumber) || 1;
    const documentNo = `${prefix}-${String(nextNumber).padStart(5,"0")}`;
    transaction.set(counterReference,{nextNumber:nextNumber+1});
    transaction.update(recordReference,{documentNo});
    return documentNo;
  });
}

export async function listRecords(collectionName){
  const firestore = initFirebase();
  let snapshot = await getDocs(collection(firestore,collectionName));
  let documents = snapshot.docs.filter(record=>record.id !== COUNTER_DOCUMENT_ID);
  if(collectionName === "ledger"){
    await ensureDefaultLedgers(firestore,documents);
    snapshot = await getDocs(collection(firestore,collectionName));
    documents = snapshot.docs.filter(record=>record.id !== COUNTER_DOCUMENT_ID);
  }
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix) return documents.map(record=>({id:record.id,...record.data()}));

  const minimumNext = documents.reduce((next,record)=>{
    const match = String(record.data().documentNo || "").match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(next,Number(match[1])+1) : next;
  },1);
  await ensureDocumentCounterFloor(collectionName,minimumNext);
  const records = [];
  for(const document of documents){
    const record = {id:document.id,...document.data()};
    if(!record.documentNo) record.documentNo = await ensureRecordDocumentNumber(collectionName,record.id);
    records.push(record);
  }
  if(collectionName==="ledger"){
    const entries=await getDocs(collection(firestore,"ledger_entries"));
    const totals=new Map();
    entries.docs.forEach(entry=>{
      const data=entry.data();
      if(!data.accountId) return;
      const current=totals.get(data.accountId)||{debits:0,credits:0};
      current.debits+=Number(data.debit)||0;
      current.credits+=Number(data.credit)||0;
      totals.set(data.accountId,current);
    });
    return records.map(record=>{
      const ledgerTotals=totals.get(record.id)||{debits:0,credits:0};
      const opening=Number(record.openingBalance)||0;
      const movement=record.balanceType==="Credit"?ledgerTotals.credits-ledgerTotals.debits:ledgerTotals.debits-ledgerTotals.credits;
      return {...record,salesDebits:ledgerTotals.debits,salesCredits:ledgerTotals.credits,currentBalance:opening+movement};
    });
  }
  return records;
}

export async function saveSale(saleId,data){
  if(!saleId&&!data) throw new Error("Sale details are required.");
  const firestore=initFirebase();
  const saleReference=saleId?doc(firestore,"sales",saleId):doc(collection(firestore,"sales"));
  const counterReference=doc(firestore,"sales",COUNTER_DOCUMENT_ID);
  const newJournalReferences=data?[doc(collection(firestore,"ledger_entries")),doc(collection(firestore,"ledger_entries"))]:[];
  let savedSale=null;

  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=saleId?await transaction.get(saleReference):null;
    if(saleId&&!existingSnapshot.exists()) throw new Error("This sale no longer exists.");
    const existing=existingSnapshot?.data()||null;
    const existingJournal=existing?await transaction.get(query(collection(firestore,"ledger_entries"),where("saleId","==",saleId))):null;
    const previousItems=Array.isArray(existing?.items)?existing.items:[];
    const nextItems=data?.items||[];
    const validatedItems=nextItems.map(item=>{
      const itemType=item.itemType==="Product"?"Product":item.itemType==="Service"?"Service":"";
      const quantity=Number(item.quantity);
      const rate=Number(item.rate);
      const taxRate=item.taxRate===undefined||item.taxRate===null||item.taxRate===""?0:Number(item.taxRate);
      if(!itemType||!item.itemId||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(rate)||rate<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100){
        throw new Error("Sale lines require a valid product or service, positive quantity, and a non-negative rate and tax rate up to 100%.");
      }
      return {...item,itemType,quantity,rate,taxRate};
    });
    const stockChanges=new Map();
    previousItems.filter(item=>item.itemType==="Product").forEach(item=>{
      stockChanges.set(item.itemId,(stockChanges.get(item.itemId)||0)+Number(item.quantity||0));
    });
    validatedItems.filter(item=>item.itemType==="Product").forEach(item=>{
      stockChanges.set(item.itemId,(stockChanges.get(item.itemId)||0)-Number(item.quantity||0));
    });
    for(const [itemId,change] of stockChanges){
      if(!Number.isFinite(change)) throw new Error("Product quantities must be valid numbers.");
      if(Math.abs(change)<0.000001) stockChanges.delete(itemId);
    }

    const recordReferences=new Map();
    const addReference=(collectionName,id)=>{
      if(id) recordReferences.set(`${collectionName}/${id}`,doc(firestore,collectionName,id));
    };
    stockChanges.forEach((_,itemId)=>addReference("products",itemId));
    previousItems.filter(item=>item.itemType==="Service"&&item.itemId).forEach(item=>addReference("services",item.itemId));
    validatedItems.forEach(item=>addReference(item.itemType==="Product"?"products":"services",item.itemId));
    if(data) addReference("company_settings","master");
    if(existing?.salesLedgerId) addReference("ledger",existing.salesLedgerId);
    if(existing?.partyLedgerId) addReference("ledger",existing.partyLedgerId);
    if(existing?.partyType==="Sundry Debtors") addReference("clients",existing.clientId);
    if(data?.salesLedgerId) addReference("ledger",data.salesLedgerId);
    if(data?.partyLedgerId) addReference("ledger",data.partyLedgerId);
    if(data?.partyType==="Sundry Debtors") addReference("clients",data.clientId);
    const recordSnapshots=new Map(await Promise.all([...recordReferences].map(async([key,reference])=>[key,await transaction.get(reference)])));
    const recordData=key=>recordSnapshots.get(key)?.data();

    if(data){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date||""))||Number.isNaN(new Date(`${data.date}T00:00:00`).getTime())){
        throw new Error("Enter a valid sale date.");
      }
      const companySettings=recordData("company_settings/master")||{};
      const taxUnregistered=String(companySettings.cmp_tax_type||"").toLowerCase()==="unregistered";
      let subtotal=0;
      let taxAmount=0;
      validatedItems.forEach(item=>{
        const itemCollection=item.itemType==="Product"?"products":"services";
        const inventory=recordData(`${itemCollection}/${item.itemId}`);
        if(!inventory) throw new Error(`A selected ${item.itemType.toLowerCase()} no longer exists.`);
        const catalogTaxRate=inventory.taxRate===undefined||inventory.taxRate===null||inventory.taxRate===""?0:Number(inventory.taxRate);
        if(!Number.isFinite(catalogTaxRate)||catalogTaxRate<0||catalogTaxRate>100){
          throw new Error(`The tax rate configured for ${inventory.name||item.itemType} must be between 0 and 100%.`);
        }
        const hsnCode=taxUnregistered||item.itemType!=="Product"?"":String(inventory.hsnCode||"").trim();
        if(hsnCode&&!/^\d{4,8}$/.test(hsnCode)){
          throw new Error(`The HSN code configured for ${inventory.name||"this product"} must contain 4 to 8 digits.`);
        }
        const amount=Number((item.quantity*item.rate).toFixed(2));
        const taxRate=taxUnregistered?0:catalogTaxRate;
        const lineTax=Number((amount*taxRate/100).toFixed(2));
        subtotal+=amount;
        taxAmount+=lineTax;
        item.description=inventory.name||item.description||item.itemType;
        item.hsnCode=hsnCode;
        item.amount=amount;
        item.taxRate=taxRate;
        item.taxAmount=lineTax;
      });
      data.items=validatedItems;
      data.subtotal=Number(subtotal.toFixed(2));
      data.taxAmount=Number(taxAmount.toFixed(2));
      data.total=Number((data.subtotal+data.taxAmount).toFixed(2));
      const salesLedger=recordData(`ledger/${data.salesLedgerId}`);
      if(!salesLedger) throw new Error("Choose an existing Sales/Income ledger.");
      const salesCategory=String(salesLedger.category||"").trim().toLowerCase();
      if(salesCategory!=="income"&&salesCategory!=="sales"&&!String(salesLedger.name||"").toLowerCase().includes("sales")){
        throw new Error("The Sale Ledger must be under Sales or Income.");
      }
      if(data.partyType==="Cash"||data.partyType==="Bank"){
        if(!String(data.reference||"").trim()) throw new Error("Enter a reference number for Cash and Bank sales.");
        const partyLedger=recordData(`ledger/${data.partyLedgerId}`);
        const accountType=String(partyLedger?.systemDefaultKey||partyLedger?.accountType||"").toLowerCase();
        if(!partyLedger||accountType!==data.partyType.toLowerCase()) throw new Error(`Choose a valid ${data.partyType} ledger.`);
        data.partyLedgerName=partyLedger.name||data.partyType;
        data.partyName=`${data.partyType}${partyLedger.name?` - ${partyLedger.name}`:""}`;
      }else if(data.partyType==="Sundry Debtors"){
        const client=recordData(`clients/${data.clientId}`);
        if(!client) throw new Error("Choose an existing client for a credit sale.");
        data.clientName=client.name||"Client";
        data.partyName=client.name||"Client";
      }else{
        throw new Error("Choose Cash, Bank, or Sundry Debtors as the party.");
      }
      if(!Array.isArray(data.items)||data.items.length===0) throw new Error("Add at least one product or service to the sale.");
      if(!Number.isFinite(data.total)||data.total<=0) throw new Error("The sale total must be greater than zero.");
      data.amount=data.total;
      data.salesLedgerName=salesLedger.name||"Sales";
    }

    const stockResults=new Map();
    for(const [itemId,change] of stockChanges){
      const product=recordData(`products/${itemId}`);
      if(!product) throw new Error("A product in this sale no longer exists. Restore the product before editing or deleting this sale.");
      const quantity=Number(product.stock)||0;
      const nextQuantity=quantity+change;
      if(nextQuantity<0) throw new Error(`Not enough stock for ${product.name||"this product"}. Available quantity: ${quantity}.`);
      stockResults.set(itemId,nextQuantity);
    }

    const clientChanges=new Map();
    if(existing?.partyType==="Sundry Debtors"){
      clientChanges.set(existing.clientId,(clientChanges.get(existing.clientId)||0)-Number(existing.total||0));
    }
    if(data?.partyType==="Sundry Debtors"){
      clientChanges.set(data.clientId,(clientChanges.get(data.clientId)||0)+Number(data.total||0));
    }
    for(const [clientId,change] of clientChanges){
      if(Math.abs(change)<0.000001) clientChanges.delete(clientId);
    }
    for(const [clientId] of clientChanges){
      const client=recordData(`clients/${clientId}`);
      if(!client) throw new Error("A client in this sale no longer exists.");
    }

    if(saleId){
      existingJournal?.docs.forEach(entry=>transaction.delete(entry.ref));
    }else{
      const counterSnapshot=await transaction.get(counterReference);
      const nextNumber=Number(counterSnapshot.data()?.nextNumber)||1;
      savedSale={id:saleReference.id,documentNo:`SAL-${String(nextNumber).padStart(5,"0")}`};
      transaction.set(counterReference,{nextNumber:nextNumber+1});
    }
    const now=serverTimestamp();
    stockResults.forEach((quantity,itemId)=>{
      transaction.update(recordReferences.get(`products/${itemId}`),{stock:quantity,updatedAt:now});
    });
    clientChanges.forEach((change,clientId)=>{
      const client=recordData(`clients/${clientId}`);
      transaction.update(recordReferences.get(`clients/${clientId}`),{
        receivableBalance:roundCurrency(Number(client.receivableBalance??client.openingBalance)||0,change),
        updatedAt:now
      });
    });

    if(!data){
      transaction.delete(saleReference);
      return;
    }
    const documentNo=existing?.documentNo||savedSale?.documentNo||`SAL-${String(Number(counterReference.nextNumber)||1).padStart(5,"0")}`;
    const saleData={
      ...data,
      documentNo,
      amount:Number(data.total),
      createdAt:existing?.createdAt||now,
      updatedAt:now
    };
    transaction.set(saleReference,saleData);
    const partyAccountId=data.partyType==="Sundry Debtors"?null:data.partyLedgerId;
    const partyClientId=data.partyType==="Sundry Debtors"?data.clientId:null;
    transaction.set(newJournalReferences[0],{
      saleId:saleReference.id,saleNo:documentNo,accountId:partyAccountId,clientId:partyClientId,
      partyType:data.partyType,debit:Number(data.total),credit:0,date:data.date,createdAt:now
    });
    transaction.set(newJournalReferences[1],{
      saleId:saleReference.id,saleNo:documentNo,accountId:data.salesLedgerId,
      partyType:"Sales",debit:0,credit:Number(data.total),date:data.date,createdAt:now
    });
    savedSale={id:saleReference.id,documentNo};
  });
  return savedSale;
}

function roundCurrency(value,change=0){
  return Math.round((value+change+Number.EPSILON)*100)/100;
}

export async function savePurchase(purchaseId,data){
  if(!purchaseId&&!data) throw new Error("Purchase details are required.");
  const firestore=initFirebase();
  const purchaseReference=purchaseId?doc(firestore,"purchases",purchaseId):doc(collection(firestore,"purchases"));
  const counterReference=doc(firestore,"purchases",COUNTER_DOCUMENT_ID);
  const newJournalReferences=data?[doc(collection(firestore,"ledger_entries")),doc(collection(firestore,"ledger_entries"))]:[];
  let savedPurchase=null;

  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=purchaseId?await transaction.get(purchaseReference):null;
    if(purchaseId&&!existingSnapshot.exists()) throw new Error("This purchase no longer exists.");
    const existing=existingSnapshot?.data()||null;
    const existingJournal=existing?await transaction.get(query(collection(firestore,"ledger_entries"),where("purchaseId","==",purchaseId))):null;
    const previousItems=Array.isArray(existing?.items)?existing.items:[];
    const nextItems=data?.items||[];
    const validatedItems=nextItems.map(item=>{
      const itemType=item.itemType==="Product"?"Product":item.itemType==="Service"?"Service":"";
      const quantity=Number(item.quantity);
      const rate=Number(item.rate);
      const taxRate=item.taxRate===undefined||item.taxRate===null||item.taxRate===""?0:Number(item.taxRate);
      if(!itemType||!item.itemId||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(rate)||rate<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100){
        throw new Error("Purchase lines require a valid product or service, positive quantity, and a non-negative rate and tax rate up to 100%.");
      }
      return {...item,itemType,quantity,rate,taxRate};
    });
    const stockChanges=new Map();
    previousItems.filter(item=>item.itemType==="Product").forEach(item=>{
      stockChanges.set(item.itemId,(stockChanges.get(item.itemId)||0)-Number(item.quantity||0));
    });
    validatedItems.filter(item=>item.itemType==="Product").forEach(item=>{
      stockChanges.set(item.itemId,(stockChanges.get(item.itemId)||0)+Number(item.quantity||0));
    });
    for(const [itemId,change] of stockChanges){
      if(!Number.isFinite(change)) throw new Error("Product quantities must be valid numbers.");
      if(Math.abs(change)<0.000001) stockChanges.delete(itemId);
    }
    const references=new Map();
    const addReference=(collectionName,id)=>{
      if(id) references.set(`${collectionName}/${id}`,doc(firestore,collectionName,id));
    };
    stockChanges.forEach((_,itemId)=>addReference("products",itemId));
    previousItems.filter(item=>item.itemType==="Service"&&item.itemId).forEach(item=>addReference("services",item.itemId));
    validatedItems.forEach(item=>addReference(item.itemType==="Product"?"products":"services",item.itemId));
    if(data) addReference("company_settings","master");
    if(existing?.purchaseLedgerId) addReference("ledger",existing.purchaseLedgerId);
    if(existing?.partyLedgerId) addReference("ledger",existing.partyLedgerId);
    if(existing?.partyType==="Sundry Creditors") addReference("suppliers",existing.supplierId);
    if(data?.purchaseLedgerId) addReference("ledger",data.purchaseLedgerId);
    if(data?.partyLedgerId) addReference("ledger",data.partyLedgerId);
    if(data?.partyType==="Sundry Creditors") addReference("suppliers",data.supplierId);
    const snapshots=new Map(await Promise.all([...references].map(async([key,reference])=>[key,await transaction.get(reference)])));
    const recordData=key=>snapshots.get(key)?.data();

    if(data){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date||""))||Number.isNaN(new Date(`${data.date}T00:00:00`).getTime())) throw new Error("Enter a valid purchase date.");
      const companySettings=recordData("company_settings/master")||{};
      const taxUnregistered=String(companySettings.cmp_tax_type||"").toLowerCase()==="unregistered";
      let subtotal=0;
      let taxAmount=0;
      validatedItems.forEach(item=>{
        const itemCollection=item.itemType==="Product"?"products":"services";
        const inventory=recordData(`${itemCollection}/${item.itemId}`);
        if(!inventory) throw new Error(`A selected ${item.itemType.toLowerCase()} no longer exists.`);
        const catalogTaxRate=inventory.taxRate===undefined||inventory.taxRate===null||inventory.taxRate===""?0:Number(inventory.taxRate);
        if(!Number.isFinite(catalogTaxRate)||catalogTaxRate<0||catalogTaxRate>100) throw new Error(`The tax rate configured for ${inventory.name||item.itemType} must be between 0 and 100%.`);
        const hsnCode=taxUnregistered||item.itemType!=="Product"?"":String(inventory.hsnCode||"").trim();
        if(hsnCode&&!/^\d{4,8}$/.test(hsnCode)) throw new Error(`The HSN code configured for ${inventory.name||"this product"} must contain 4 to 8 digits.`);
        const amount=Number((item.quantity*item.rate).toFixed(2));
        const taxRate=taxUnregistered?0:catalogTaxRate;
        const lineTax=Number((amount*taxRate/100).toFixed(2));
        subtotal+=amount;
        taxAmount+=lineTax;
        item.description=inventory.name||item.description||item.itemType;
        item.hsnCode=hsnCode;
        item.amount=amount;
        item.taxRate=taxRate;
        item.taxAmount=lineTax;
      });
      data.items=validatedItems;
      data.subtotal=Number(subtotal.toFixed(2));
      data.taxAmount=Number(taxAmount.toFixed(2));
      data.total=Number((data.subtotal+data.taxAmount).toFixed(2));
      const purchaseLedger=recordData(`ledger/${data.purchaseLedgerId}`);
      if(!purchaseLedger) throw new Error("Choose an existing Purchase/Expense ledger.");
      const purchaseCategory=String(purchaseLedger.category||"").trim().toLowerCase();
      if(!["expenses","expense","purchases","purchase"].includes(purchaseCategory)&&!/(purchase|cost of goods)/i.test(String(purchaseLedger.name||""))) throw new Error("The Purchase Ledger must be under Expenses or Purchases.");
      if(data.partyType==="Cash"||data.partyType==="Bank"){
        if(!String(data.reference||"").trim()) throw new Error("Enter a reference number for Cash and Bank purchases.");
        const partyLedger=recordData(`ledger/${data.partyLedgerId}`);
        const accountType=String(partyLedger?.systemDefaultKey||partyLedger?.accountType||"").toLowerCase();
        if(!partyLedger||accountType!==data.partyType.toLowerCase()) throw new Error(`Choose a valid ${data.partyType} ledger.`);
        data.partyLedgerName=partyLedger.name||data.partyType;
        data.partyName=`${data.partyType}${partyLedger.name?` - ${partyLedger.name}`:""}`;
      }else if(data.partyType==="Sundry Creditors"){
        const supplier=recordData(`suppliers/${data.supplierId}`);
        if(!supplier) throw new Error("Choose an existing supplier for a credit purchase.");
        const partyLedger=recordData(`ledger/${data.partyLedgerId}`);
        if(!partyLedger||partyLedger.systemDefaultKey!=="sundry-creditors") throw new Error("Choose the Sundry Creditors ledger for a credit purchase.");
        data.supplierName=supplier.name||"Supplier";
        data.partyLedgerName=partyLedger.name||"Sundry Creditors";
        data.partyName=supplier.name||"Supplier";
      }else throw new Error("Choose Cash, Bank, or Sundry Creditors as the party.");
      if(!validatedItems.length) throw new Error("Add at least one product or service to the purchase.");
      if(!Number.isFinite(data.total)||data.total<=0) throw new Error("The purchase total must be greater than zero.");
      data.amount=data.total;
      data.purchaseLedgerName=purchaseLedger.name||"Purchases";
    }

    const stockResults=new Map();
    for(const [itemId,change] of stockChanges){
      const product=recordData(`products/${itemId}`);
      if(!product) throw new Error("A product in this purchase no longer exists. Restore the product before editing or deleting this purchase.");
      const quantity=Number(product.stock)||0;
      const nextQuantity=quantity+change;
      if(nextQuantity<0) throw new Error(`Cannot reverse this purchase because ${product.name||"a product"} stock is below the quantity being removed.`);
      stockResults.set(itemId,nextQuantity);
    }
    const supplierChanges=new Map();
    if(existing?.partyType==="Sundry Creditors") supplierChanges.set(existing.supplierId,(supplierChanges.get(existing.supplierId)||0)-Number(existing.total||0));
    if(data?.partyType==="Sundry Creditors") supplierChanges.set(data.supplierId,(supplierChanges.get(data.supplierId)||0)+Number(data.total||0));
    for(const [supplierId,change] of [...supplierChanges]){
      if(!supplierId||Math.abs(change)<0.000001) supplierChanges.delete(supplierId);
      else if(!recordData(`suppliers/${supplierId}`)) throw new Error("A supplier linked to this purchase no longer exists.");
    }
    if(purchaseId) existingJournal?.docs.forEach(entry=>transaction.delete(entry.ref));
    else{
      const counterSnapshot=await transaction.get(counterReference);
      const nextNumber=Number(counterSnapshot.data()?.nextNumber)||1;
      savedPurchase={id:purchaseReference.id,documentNo:`PUR-${String(nextNumber).padStart(5,"0")}`};
      transaction.set(counterReference,{nextNumber:nextNumber+1});
    }
    const now=serverTimestamp();
    stockResults.forEach((quantity,itemId)=>transaction.update(references.get(`products/${itemId}`),{stock:quantity,updatedAt:now}));
    supplierChanges.forEach((change,supplierId)=>{
      const supplier=recordData(`suppliers/${supplierId}`);
      transaction.update(references.get(`suppliers/${supplierId}`),{
        payableBalance:roundCurrency(Number(supplier.payableBalance??supplier.openingBalance)||0,change),
        updatedAt:now
      });
    });
    if(!data){
      transaction.delete(purchaseReference);
      return;
    }
    const documentNo=existing?.documentNo||savedPurchase?.documentNo||`PUR-${String(Number(counterReference.nextNumber)||1).padStart(5,"0")}`;
    transaction.set(purchaseReference,{...data,documentNo,amount:Number(data.total),createdAt:existing?.createdAt||now,updatedAt:now});
    const partyAccountId=data.partyLedgerId;
    const partySupplierId=data.partyType==="Sundry Creditors"?data.supplierId:null;
    transaction.set(newJournalReferences[0],{
      purchaseId:purchaseReference.id,purchaseNo:documentNo,accountId:data.purchaseLedgerId,
      partyType:"Purchases",debit:Number(data.total),credit:0,date:data.date,createdAt:now
    });
    transaction.set(newJournalReferences[1],{
      purchaseId:purchaseReference.id,purchaseNo:documentNo,accountId:partyAccountId,supplierId:partySupplierId,
      partyType:data.partyType,debit:0,credit:Number(data.total),date:data.date,createdAt:now
    });
    savedPurchase={id:purchaseReference.id,documentNo};
  });
  return savedPurchase;
}

export async function deletePurchase(purchaseId){
  if(!purchaseId) throw new Error("Select a purchase to delete.");
  return savePurchase(purchaseId,null);
}

export async function saveAccountingVoucher(collectionName,voucherId,data){
  if(!["contra_vouchers","journal_vouchers"].includes(collectionName)) throw new Error("Choose a supported accounting voucher.");
  if(!voucherId&&!data) throw new Error("Voucher details are required.");
  const isContra=collectionName==="contra_vouchers";
  const isJournal=collectionName==="journal_vouchers";
  const firestore=initFirebase();
  const reference=voucherId?doc(firestore,collectionName,voucherId):doc(collection(firestore,collectionName));
  const counterReference=doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  const newEntryReferences=data?(data.entries||[]).map(()=>doc(collection(firestore,"ledger_entries"))):[];
  let saved=null;
  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=voucherId?await transaction.get(reference):null;
    if(voucherId&&!existingSnapshot.exists()) throw new Error("This voucher no longer exists.");
    const existing=existingSnapshot?.data()||null;
    const linkedField=isContra?"contraId":"journalVoucherId";
    const existingEntries=existing?await transaction.get(query(collection(firestore,"ledger_entries"),where(linkedField,"==",voucherId))):null;
    const rows=data?.entries||[];
    if(data){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date||""))||Number.isNaN(new Date(`${data.date}T00:00:00`).getTime())) throw new Error("Enter a valid voucher date.");
      if(isContra&&rows.length!==2) throw new Error("A Contra voucher must contain exactly two ledger lines.");
      if(isJournal&&rows.length!==2) throw new Error("A Journal voucher must contain exactly two ledger lines.");
      let debitTotal=0,creditTotal=0;
      rows.forEach(row=>{
        row.debit=Number(row.debit)||0;
        row.credit=Number(row.credit)||0;
        if(!row.accountId||!Number.isFinite(row.debit)||!Number.isFinite(row.credit)||row.debit<0||row.credit<0||row.debit>0&&row.credit>0||row.debit===row.credit) throw new Error("Each voucher line must have one positive debit or credit and a ledger.");
        debitTotal+=row.debit;
        creditTotal+=row.credit;
      });
      if(debitTotal<=0||Math.abs(debitTotal-creditTotal)>0.005) throw new Error("Total debits and credits must be equal and greater than zero.");
      if(isContra||isJournal){
        const amount=Number(data.amount);
        if(!Number.isFinite(amount)||amount<=0||!data.ledgerInId||!data.ledgerOutId) throw new Error(`Enter a positive amount and choose both ${isContra?"Cash/Bank":"ledger"} accounts.`);
        if(rows[0].accountId!==data.ledgerInId||rows[1].accountId!==data.ledgerOutId||rows[0].debit!==amount||rows[0].credit!==0||rows[1].debit!==0||rows[1].credit!==amount) throw new Error(`${isContra?"Contra":"Journal"} entries must debit Ledger in and credit Ledger out for the entered amount.`);
        data={...data,amount};
      }
      data={...data,entries:rows,debitTotal:Number(debitTotal.toFixed(2)),creditTotal:Number(creditTotal.toFixed(2))};
    }
    const ledgerIds=[...new Set(rows.map(row=>row.accountId).filter(Boolean))];
    const ledgerReferences=new Map(ledgerIds.map(id=>[id,doc(firestore,"ledger",id)]));
    const [counterSnapshot,...ledgerSnapshots]=await Promise.all([
      voucherId?Promise.resolve(null):transaction.get(counterReference),
      ...[...ledgerReferences.values()].map(ledgerReference=>transaction.get(ledgerReference))
    ]);
    const ledgers=new Map([...ledgerReferences.keys()].map((id,index)=>[id,ledgerSnapshots[index]]));
    if(data){
      for(const [ledgerId,snapshot] of ledgers){
        if(!snapshot.exists()) throw new Error("A selected ledger no longer exists.");
        if(isContra&&!["cash","bank"].includes(String(snapshot.data().systemDefaultKey||snapshot.data().accountType||"").toLowerCase())) throw new Error("Contra entries can only transfer between Cash and Bank ledgers.");
      }
      if((isContra||isJournal)&&rows[0].accountId===rows[1].accountId) throw new Error(`Choose two different ledgers for a ${isContra?"Contra":"Journal"} entry.`);
    }
    if(existingEntries?.docs) existingEntries.docs.forEach(entry=>transaction.delete(entry.ref));
    if(!data){transaction.delete(reference);return;}
    let documentNo=existing?.documentNo;
    if(!voucherId){
      const nextNumber=Number(counterSnapshot.data()?.nextNumber)||1;
      documentNo=`${DOCUMENT_PREFIXES[collectionName]}-${String(nextNumber).padStart(5,"0")}`;
      transaction.set(counterReference,{nextNumber:nextNumber+1});
    }
    const now=serverTimestamp();
    transaction.set(reference,{...data,documentNo:documentNo||existing.documentNo,createdAt:existing?.createdAt||now,updatedAt:now});
    rows.forEach((row,index)=>transaction.set(newEntryReferences[index],{
      [linkedField]:reference.id,voucherNo:documentNo,accountId:row.accountId,partyType:isContra?"Contra":"Journal",
      debit:row.debit,credit:row.credit,narration:row.narration||data.narration||"",date:data.date,createdAt:now
    }));
    saved={id:reference.id,documentNo};
  });
  return saved;
}

export async function deleteAccountingVoucher(collectionName,voucherId){
  if(!voucherId) throw new Error("Select a voucher to delete.");
  return saveAccountingVoucher(collectionName,voucherId,null);
}

export async function saveEstimate(estimateId,data){
  if(!estimateId&&!data) throw new Error("Estimate details are required.");
  const collectionName="estimates";
  const firestore=initFirebase();
  const reference=estimateId?doc(firestore,collectionName,estimateId):doc(collection(firestore,collectionName));
  const counterReference=doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  let saved=null;
  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=estimateId?await transaction.get(reference):null;
    if(estimateId&&!existingSnapshot.exists()) throw new Error("This estimate no longer exists.");
    const existing=existingSnapshot?.data()||null;
    if(existing?.convertedSaleId) throw new Error("A converted estimate cannot be edited.");
    if(!data&&existing?.conversionLock) throw new Error("An estimate being converted cannot be deleted.");
    let counterSnapshot=null;
    if(data&&!estimateId) counterSnapshot=await transaction.get(counterReference);
    if(!data){transaction.delete(reference);return;}
    const amount=Number(data.total);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date||""))||Number.isNaN(new Date(`${data.date}T00:00:00`).getTime())) throw new Error("Enter a valid estimate date.");
    if(!data.clientId||!data.salesLedgerId||!Array.isArray(data.items)||data.items.length===0||!Number.isFinite(amount)||amount<=0) throw new Error("An estimate requires a client, sales ledger, at least one line, and a valid total.");
    data.items.forEach(item=>{
      if(!["Product","Service"].includes(item.itemType)||!item.itemId||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0||!Number.isFinite(Number(item.rate))||Number(item.rate)<0) throw new Error("Estimate lines require a valid product or service, positive quantity, and non-negative rate.");
    });
    const [clientSnapshot,salesLedgerSnapshot]=await Promise.all([
      transaction.get(doc(firestore,"clients",data.clientId)),
      transaction.get(doc(firestore,"ledger",data.salesLedgerId))
    ]);
    if(!clientSnapshot.exists()) throw new Error("Choose an existing client for this estimate.");
    const salesLedger=salesLedgerSnapshot.data();
    if(!salesLedger) throw new Error("Choose an existing Sales/Income ledger.");
    const salesCategory=String(salesLedger.category||"").trim().toLowerCase();
    if(salesCategory!=="income"&&salesCategory!=="sales"&&!String(salesLedger.name||"").toLowerCase().includes("sales")) throw new Error("The estimate ledger must be under Sales or Income.");
    const nextNumber=Number(counterSnapshot?.data()?.nextNumber)||1;
    const documentNo=existing?.documentNo||`EST-${String(nextNumber).padStart(5,"0")}`;
    const now=serverTimestamp();
    if(!estimateId) transaction.set(counterReference,{nextNumber:nextNumber+1});
    transaction.set(reference,{...data,documentNo,createdAt:existing?.createdAt||now,updatedAt:now});
    saved={id:reference.id,documentNo};
  });
  return saved;
}

export async function convertEstimateToSale(estimateId){
  if(!estimateId) throw new Error("Select an estimate to convert.");
  const firestore=initFirebase();
  const reference=doc(firestore,"estimates",estimateId);
  const linkedSales=await getDocs(query(collection(firestore,"sales"),where("estimateId","==",estimateId)));
  if(linkedSales.size>1) throw new Error("Multiple sales are linked to this estimate. Contact support before converting it again.");
  if(linkedSales.size===1){
    const saleDocument=linkedSales.docs[0];
    const sale={id:saleDocument.id,...saleDocument.data()};
    await runTransaction(firestore,async transaction=>{
      const snapshot=await transaction.get(reference);
      if(!snapshot.exists()) throw new Error("This estimate no longer exists.");
      if(snapshot.data().convertedSaleId&&snapshot.data().convertedSaleId!==sale.id) throw new Error("This estimate has already been converted to another sale.");
      transaction.update(reference,{convertedSaleId:sale.id,convertedSaleNo:sale.documentNo||"",conversionLock:"",updatedAt:serverTimestamp()});
    });
    return sale;
  }
  const lockId=`convert-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let estimate;
  await runTransaction(firestore,async transaction=>{
    const snapshot=await transaction.get(reference);
    if(!snapshot.exists()) throw new Error("This estimate no longer exists.");
    estimate=snapshot.data();
    if(estimate.convertedSaleId) throw new Error("This estimate has already been converted to a sale.");
    if(estimate.conversionLock) throw new Error("This estimate is already being converted.");
    transaction.update(reference,{conversionLock:lockId,updatedAt:serverTimestamp()});
  });
  let sale=null;
  try{
    sale=await saveSale(null,{
      date:estimate.date,
      salesLedgerId:estimate.salesLedgerId,
      partyType:"Sundry Debtors",
      clientId:estimate.clientId,
      reference:estimate.documentNo,
      estimateId,
      notes:estimate.notes||"Converted from estimate",
      items:estimate.items
    });
    await updateDoc(reference,{convertedSaleId:sale.id,convertedSaleNo:sale.documentNo,conversionLock:"",updatedAt:serverTimestamp()});
    return sale;
  }catch(error){
    if(!sale) await runTransaction(firestore,async transaction=>{
      const snapshot=await transaction.get(reference);
      if(snapshot.exists()&&snapshot.data().conversionLock===lockId) transaction.update(reference,{conversionLock:"",updatedAt:serverTimestamp()});
    });
    throw error;
  }
}

export async function saveReturnRecord(returnType,returnId,data){
  const salesReturn=returnType==="sales";
  if(!salesReturn&&returnType!=="purchase") throw new Error("Choose Sales Return or Purchase Return.");
  if(!returnId&&!data) throw new Error("Return details are required.");
  const firestore=initFirebase();
  const collectionName=salesReturn?"sales_returns":"purchase_returns";
  const originalCollection=salesReturn?"sales":"purchases";
  const returnReference=returnId?doc(firestore,collectionName,returnId):doc(collection(firestore,collectionName));
  const counterReference=doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  const newJournalReferences=data?[doc(collection(firestore,"ledger_entries")),doc(collection(firestore,"ledger_entries"))]:[];
  let saved=null;
  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=returnId?await transaction.get(returnReference):null;
    if(returnId&&!existingSnapshot.exists()) throw new Error("This return voucher no longer exists.");
    const existing=existingSnapshot?.data()||null;
    const originalId=data?.originalId||existing?.originalId;
    const [existingEntries,otherReturns]=await Promise.all([
      existing?transaction.get(query(collection(firestore,"ledger_entries"),where("returnId","==",returnId))):Promise.resolve(null),
      originalId?transaction.get(query(collection(firestore,collectionName),where("originalId","==",originalId))):Promise.resolve(null)
    ]);
    const originalReference=originalId?doc(firestore,originalCollection,originalId):null;
    const originalSnapshot=originalReference?await transaction.get(originalReference):null;
    if(data&&(!originalSnapshot?.exists()||!originalId)) throw new Error(`Select an existing ${salesReturn?"sale":"purchase"} to return against.`);
    const original=originalSnapshot?.data()||null;
    const previousItems=existing?.items||[];
    const nextItems=data?.items||[];
    if(data){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date||""))||Number.isNaN(new Date(`${data.date}T00:00:00`).getTime())) throw new Error("Enter a valid return date.");
      if(!nextItems.length) throw new Error("Add at least one line to this return.");
    }
    const originalItems=original?.items||[];
    const returnKey=item=>`${item.itemType}:${item.itemId}`;
    const originalQuantities=new Map();
    originalItems.forEach(item=>originalQuantities.set(returnKey(item),(originalQuantities.get(returnKey(item))||0)+Number(item.quantity||0)));
    const productChanges=new Map();
    previousItems.filter(item=>item.itemType==="Product").forEach(item=>productChanges.set(item.itemId,(productChanges.get(item.itemId)||0)+(salesReturn?-1:1)*Number(item.quantity||0)));
    nextItems.filter(item=>item.itemType==="Product").forEach(item=>productChanges.set(item.itemId,(productChanges.get(item.itemId)||0)+(salesReturn?1:-1)*Number(item.quantity||0)));
    const totals=new Map();
    (otherReturns?.docs||[]).filter(entry=>entry.id!==returnId).forEach(entry=>{
      (entry.data().items||[]).forEach(item=>totals.set(returnKey(item),(totals.get(returnKey(item))||0)+Number(item.quantity||0)));
    });
    const nextQuantities=new Map();
    nextItems.forEach(item=>{
      if(!item.itemId||!["Product","Service"].includes(item.itemType)||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0) throw new Error("Return lines need a valid product or service and positive quantity.");
      const key=returnKey(item);
      nextQuantities.set(key,(nextQuantities.get(key)||0)+Number(item.quantity));
    });
    nextQuantities.forEach((quantity,key)=>{
      if((totals.get(key)||0)+quantity>(originalQuantities.get(key)||0)+0.000001) throw new Error("The returned quantity exceeds the quantity on the original sale or purchase.");
    });
    if(data){
      const originalsById=new Map(originalItems.map(item=>[item.itemId,item]));
      let subtotal=0,taxAmount=0;
      data.items=nextItems.map(item=>{
        const originalItem=originalsById.get(item.itemId);
        if(!originalItem||originalItem.itemType!==item.itemType) throw new Error("Return items must match a line on the original sale or purchase.");
        const quantity=Number(item.quantity),lineRate=Number(originalItem.rate)||0;
        const amount=Number((quantity*lineRate).toFixed(2));
        const taxRate=Number(originalItem.taxRate)||0;
        const lineTax=Number((amount*taxRate/100).toFixed(2));
        subtotal+=amount;taxAmount+=lineTax;
        return {...item,description:originalItem.description,itemType:originalItem.itemType,rate:lineRate,quantity,amount,taxRate,taxAmount:lineTax,hsnCode:originalItem.hsnCode||""};
      });
      data.subtotal=Number(subtotal.toFixed(2));
      data.taxAmount=Number(taxAmount.toFixed(2));
      data.total=Number((subtotal+taxAmount).toFixed(2));
    }
    const partyCollection=salesReturn?"clients":"suppliers";
    const partyId=salesReturn?original?.clientId:original?.supplierId;
    const partyType=original?.partyType;
    const partyLedgerId=original?.partyLedgerId;
    const postingLedgerIds=[salesReturn?original?.salesLedgerId:original?.purchaseLedgerId,partyLedgerId].filter(Boolean);
    if(!partyId&&partyType==="Sundry Debtors"||!partyId&&partyType==="Sundry Creditors") throw new Error("The party on the original transaction is no longer linked.");
    const productReferences=new Map([...productChanges.keys()].map(id=>[id,doc(firestore,"products",id)]));
    const partyReference=partyId?doc(firestore,partyCollection,partyId):null;
    const ledgerReferences=new Map([...new Set(postingLedgerIds)].map(id=>[id,doc(firestore,"ledger",id)]));
    const [counterSnapshot,...snapshots]=await Promise.all([
      data&&!returnId?transaction.get(counterReference):Promise.resolve(null),
      ...[...productReferences.values()].map(reference=>transaction.get(reference)),
      ...(partyReference?[transaction.get(partyReference)]:[]),
      ...[...ledgerReferences.values()].map(reference=>transaction.get(reference))
    ]);
    let offset=snapshots.length;
    const productSnapshots=snapshots.slice(0,productReferences.size);
    const partySnapshot=partyReference?snapshots[offset++]:null;
    const ledgers=new Map([...ledgerReferences.keys()].map((id,index)=>[id,snapshots[offset+index]]));
    for(const [id,snapshot] of ledgers) if(!snapshot.exists()) throw new Error("A ledger linked to the original transaction no longer exists.");
    const stockResults=new Map();
    for(const [productId,change] of productChanges){
      const snapshot=productSnapshots[[...productReferences.keys()].indexOf(productId)];
      if(!snapshot?.exists()) throw new Error("A product linked to this return no longer exists.");
      const nextQuantity=(Number(snapshot.data().stock)||0)+change;
      if(nextQuantity<0) throw new Error(`Cannot return more ${snapshot.data().name||"product"} stock than is currently available.`);
      stockResults.set(productId,nextQuantity);
    }
    if(partyReference&&!partySnapshot?.exists()) throw new Error("The party linked to the original transaction no longer exists.");
    const partyChange=(Number(existing?.total)||0)-(Number(data?.total)||0);
    if(returnId&&existing?.originalId!==originalId) throw new Error("A return cannot be reassigned to another original transaction.");
    if(existingEntries?.docs) existingEntries.docs.forEach(entry=>transaction.delete(entry.ref));
    if(!data){
      stockResults.forEach((quantity,productId)=>transaction.update(productReferences.get(productId),{stock:quantity,updatedAt:serverTimestamp()}));
      if(partyReference&&Math.abs(partyChange)>0.000001){
        const party=partySnapshot.data(),field=salesReturn?"receivableBalance":"payableBalance";
        transaction.update(partyReference,{[field]:roundCurrency(Number(party[field]??party.openingBalance)||0,partyChange),updatedAt:serverTimestamp()});
      }
      transaction.delete(returnReference);
      return;
    }
    let documentNo=existing?.documentNo;
    if(!returnId){
      const nextNumber=Number(counterSnapshot.data()?.nextNumber)||1;
      documentNo=`${DOCUMENT_PREFIXES[collectionName]}-${String(nextNumber).padStart(5,"0")}`;
      transaction.set(counterReference,{nextNumber:nextNumber+1});
    }
    const now=serverTimestamp();
    stockResults.forEach((quantity,productId)=>transaction.update(productReferences.get(productId),{stock:quantity,updatedAt:now}));
    if(partyReference&&Math.abs(partyChange)>0.000001){
      const party=partySnapshot.data(),field=salesReturn?"receivableBalance":"payableBalance";
      transaction.update(partyReference,{[field]:roundCurrency(Number(party[field]??party.openingBalance)||0,partyChange),updatedAt:now});
    }
    transaction.set(returnReference,{...data,originalId,originalNo:original.documentNo,partyId,partyType,documentNo:documentNo||existing.documentNo,createdAt:existing?.createdAt||now,updatedAt:now});
    const primaryLedgerId=salesReturn?original.salesLedgerId:partyLedgerId;
    const secondaryLedgerId=salesReturn?partyLedgerId:original.purchaseLedgerId;
    const partyClientId=salesReturn&&partyType==="Sundry Debtors"?partyId:null;
    const partySupplierId=!salesReturn&&partyType==="Sundry Creditors"?partyId:null;
    const firstDebit=salesReturn?Number(data.total):Number(data.total);
    const firstCredit=salesReturn?0:0;
    const secondDebit=0,secondCredit=Number(data.total);
    transaction.set(newJournalReferences[0],{
      returnId:returnReference.id,returnNo:documentNo,accountId:primaryLedgerId,
      supplierId:partySupplierId,debit:firstDebit,credit:firstCredit,partyType:salesReturn?"Sales Return":"Purchase Return",
      date:data.date,createdAt:now
    });
    transaction.set(newJournalReferences[1],{
      returnId:returnReference.id,returnNo:documentNo,accountId:secondaryLedgerId,
      clientId:partyClientId,
      debit:secondDebit,credit:secondCredit,partyType:salesReturn?"Sales Return":"Purchase Return",
      date:data.date,createdAt:now
    });
    saved={id:returnReference.id,documentNo};
  });
  return saved;
}

function transactionPartyDelta(record){
  if(!record) return 0;
  const amount=Number(record.amount);
  if(!Number.isFinite(amount)||amount<0) throw new Error("Transaction amounts must be valid non-negative numbers.");
  const collectionName=record.partyCollection||(record.partyType==="Supplier"?"suppliers":"clients");
  if(!record.partyId) throw new Error("Select a party for this transaction.");
  if(collectionName==="ledger") return 0;
  if(record.type==="Receipt"&&collectionName==="clients") return -amount;
  if(record.type==="Payment"&&collectionName==="suppliers") return -amount;
  return 0;
}

async function saveTransactionRecord(recordId,data){
  const firestore=initFirebase();
  const reference=recordId?doc(firestore,"transactions",recordId):doc(collection(firestore,"transactions"));
  const counterReference=doc(firestore,"transactions",COUNTER_DOCUMENT_ID);
  const newJournalReferences=data?[doc(collection(firestore,"ledger_entries")),doc(collection(firestore,"ledger_entries"))]:[];
  if(data){
    const amount=Number(data.amount);
    if(!Number.isFinite(amount)||amount<0) throw new Error("Enter a valid non-negative transaction amount.");
    if(!["Receipt","Payment"].includes(data.type)) throw new Error("Choose Receipt or Payment as the transaction type.");
    const partyCollection=data.partyCollection||(data.partyType==="Supplier"?"suppliers":"clients");
    if(!data.partyId||!["clients","suppliers","ledger"].includes(partyCollection)) throw new Error("Select a client, supplier, or ledger for this transaction.");
    if(data.type==="Receipt"&&!["clients","ledger"].includes(partyCollection)||data.type==="Payment"&&!["suppliers","ledger"].includes(partyCollection)) throw new Error("Receipts must be linked to clients or ledgers; Payments must be linked to suppliers or ledgers.");
    if(!data.account) throw new Error("Select a Cash or Bank ledger for this transaction.");
    data={...data,partyCollection,partyType:partyCollection==="suppliers"?"Supplier":partyCollection==="ledger"?"Ledger":"Client"};
    transactionPartyDelta(data);
  }
  let savedId=recordId||reference.id;
  await runTransaction(firestore,async transaction=>{
    const existingSnapshot=recordId?await transaction.get(reference):null;
    if(recordId&&!existingSnapshot.exists()) throw new Error("This transaction no longer exists.");
    const existing=existingSnapshot?.data()||null;
    const existingJournal=existing?await transaction.get(query(collection(firestore,"ledger_entries"),where("transactionId","==",recordId))):null;
    const balanceChanges=new Map();
    const addPartyChange=record=>{
      if(!record?.partyId) return;
      const collectionName=record.partyCollection||(record.partyType==="Supplier"?"suppliers":"clients");
      const key=`${collectionName}/${record.partyId}`;
      balanceChanges.set(key,(balanceChanges.get(key)||0)-transactionPartyDelta(record));
    };
    addPartyChange(existing);
    if(data?.partyId){
      const key=`${data.partyCollection}/${data.partyId}`;
      balanceChanges.set(key,(balanceChanges.get(key)||0)+transactionPartyDelta(data));
    }
    for(const [key,change] of [...balanceChanges]){
      if(Math.abs(change)<0.000001) balanceChanges.delete(key);
    }
    const partyReferences=new Map([...balanceChanges.keys()].map(key=>{
      const [collectionName,partyId]=key.split("/");
      return [key,doc(firestore,collectionName,partyId)];
    }));
    const accountReference=data?.account?doc(firestore,"ledger",data.account):null;
    const [counterSnapshot,...partySnapshots]=await Promise.all([
      recordId?Promise.resolve(null):transaction.get(counterReference),
      ...[...partyReferences.values()].map(partyReference=>transaction.get(partyReference)),
      ...(accountReference?[transaction.get(accountReference)]:[])
    ]);
    const partySnapshotEntries=partySnapshots.slice(0,partyReferences.size);
    const parties=new Map([...partyReferences.keys()].map((key,index)=>[key,partySnapshotEntries[index]]));
    for(const [key] of balanceChanges){
      if(!parties.get(key)?.exists()) throw new Error("A client or supplier linked to this transaction no longer exists.");
    }
    const accountSnapshot=accountReference?partySnapshots[partyReferences.size]:null;
    if(data){
      if(!accountSnapshot?.exists()) throw new Error("Choose an existing Cash or Bank ledger.");
      const account=accountSnapshot.data();
      if(!["cash","bank"].includes(String(account.systemDefaultKey||account.accountType||"").toLowerCase())) throw new Error("The payment mode must be a Cash or Bank ledger.");
    }
    const partyLedgerSnapshot=data?.partyCollection==="ledger"
      ?await transaction.get(doc(firestore,"ledger",data.partyId))
      :null;
    if(data?.partyCollection==="ledger"&&!partyLedgerSnapshot?.exists()) throw new Error("The selected ledger no longer exists. Refresh the Ledger module and try again.");
    const supplierPayableLedgerSnapshot=data?.partyCollection==="suppliers"
      ?await transaction.get(query(collection(firestore,"ledger"),where("systemDefaultKey","==","sundry-creditors")))
      :null;
    const supplierPayableLedgerId=supplierPayableLedgerSnapshot?.docs[0]?.id;
    if(data?.partyCollection==="suppliers"&&!supplierPayableLedgerId) throw new Error("The Sundry Creditors ledger is missing. Refresh the Ledger module and try again.");
    const now=serverTimestamp();
    for(const [key,change] of balanceChanges){
      const [collectionName,partyId]=key.split("/");
      const party=parties.get(key).data();
      const balanceField=collectionName==="suppliers"?"payableBalance":"receivableBalance";
      const balance=Number(party[balanceField]??party.openingBalance)||0;
      transaction.update(partyReferences.get(key),{[balanceField]:roundCurrency(balance,change),updatedAt:now});
    }
    if(existingJournal?.docs) existingJournal.docs.forEach(entry=>transaction.delete(entry.ref));
    if(!data){
      transaction.delete(reference);
      return;
    }
    let documentNo=existing?.documentNo;
    if(!recordId){
      const nextNumber=Number(counterSnapshot.data()?.nextNumber)||1;
      documentNo=`TRN-${String(nextNumber).padStart(5,"0")}`;
      transaction.set(counterReference,{nextNumber:nextNumber+1});
    }
    transaction.set(reference,{
      ...data,
      documentNo:documentNo||`TRN-${String(Number(counterSnapshot?.data()?.nextNumber)||1).padStart(5,"0")}`,
      createdAt:existing?.createdAt||now,
      updatedAt:now
    });
    const amount=Number(data.amount);
    const partyIsSupplier=data.partyCollection==="suppliers";
    const partyIsLedger=data.partyCollection==="ledger";
    const partyIsPayment=data.type==="Payment";
    const firstAccountId=partyIsSupplier
      ?supplierPayableLedgerId
      :partyIsLedger&&partyIsPayment?data.partyId:data.account;
    const secondAccountId=partyIsSupplier
      ?data.account
      :partyIsLedger&&!partyIsPayment?data.partyId:null;
    transaction.set(newJournalReferences[0],{
      transactionId:reference.id,transactionNo:documentNo,accountId:firstAccountId,
      clientId:partyIsSupplier||partyIsLedger?null:data.partyId,supplierId:partyIsSupplier?data.partyId:null,
      partyType:data.type,debit:amount,credit:0,
      date:data.date,createdAt:now
    });
    transaction.set(newJournalReferences[1],{
      transactionId:reference.id,transactionNo:documentNo,accountId:partyIsSupplier?data.account:secondAccountId,
      clientId:partyIsSupplier||partyIsLedger?null:data.partyId,supplierId:partyIsSupplier?data.partyId:null,
      partyType:data.type,debit:0,credit:amount,
      date:data.date,createdAt:now
    });
    savedId=reference.id;
  });
  return savedId;
}

async function updateClientRecord(recordId,data){
  const firestore=initFirebase();
  const reference=doc(firestore,"clients",recordId);
  const openingBalance=Number(data.openingBalance);
  if(!Number.isFinite(openingBalance)) throw new Error("Enter a valid client opening balance.");
  await runTransaction(firestore,async transaction=>{
    const snapshot=await transaction.get(reference);
    if(!snapshot.exists()) throw new Error("This client no longer exists.");
    const current=snapshot.data();
    const previousOpening=Number(current.openingBalance)||0;
    const currentDue=Number(current.receivableBalance??previousOpening)||0;
    transaction.update(reference,{
      ...data,
      openingBalance,
      receivableBalance:roundCurrency(currentDue,openingBalance-previousOpening),
      updatedAt:serverTimestamp()
    });
  });
}

async function updateSupplierRecord(recordId,data){
  const firestore=initFirebase();
  const reference=doc(firestore,"suppliers",recordId);
  const openingBalance=Number(data.openingBalance);
  if(!Number.isFinite(openingBalance)) throw new Error("Enter a valid supplier opening balance.");
  await runTransaction(firestore,async transaction=>{
    const snapshot=await transaction.get(reference);
    if(!snapshot.exists()) throw new Error("This supplier no longer exists.");
    const current=snapshot.data();
    const previousOpening=Number(current.openingBalance)||0;
    const currentDue=Number(current.payableBalance??previousOpening)||0;
    transaction.update(reference,{
      ...data,
      openingBalance,
      payableBalance:roundCurrency(currentDue,openingBalance-previousOpening),
      updatedAt:serverTimestamp()
    });
  });
}

export async function deleteSale(saleId){
  if(!saleId) throw new Error("Select a sale to delete.");
  return saveSale(saleId,null);
}

export async function createRecord(collectionName, data){
  if(collectionName==="transactions") return saveTransactionRecord(null,data);
  const firestore = initFirebase();
  const reference = doc(collection(firestore,collectionName));
  if(collectionName==="clients"||collectionName==="suppliers"){
    const openingBalance=Number(data.openingBalance??0);
    if(!Number.isFinite(openingBalance)) throw new Error(`Enter a valid ${collectionName==="suppliers"?"supplier":"client"} opening balance.`);
    data={...data,openingBalance,[collectionName==="suppliers"?"payableBalance":"receivableBalance"]:openingBalance};
  }
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix){
    const now = serverTimestamp();
    await setDoc(reference,{...data,createdAt:now,updatedAt:now});
    return reference.id;
  }
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  await runTransaction(firestore,async transaction=>{
    const snapshot = await transaction.get(counterReference);
    const nextNumber = Number(snapshot.data()?.nextNumber) || 1;
    const now = serverTimestamp();
    transaction.set(counterReference,{nextNumber:nextNumber+1});
    transaction.set(reference,{
      ...data,
      documentNo:`${prefix}-${String(nextNumber).padStart(5,"0")}`,
      createdAt:now,
      updatedAt:now
    });
  });
  return reference.id;
}

export async function issueCheque(checkbookId,data){
  const firestore=initFirebase();
  const checkbookReference=doc(firestore,"checkbooks",checkbookId);
  const chequeReference=doc(collection(firestore,"cheques"));
  const counterReference=doc(firestore,"cheques",COUNTER_DOCUMENT_ID);
  let issuedCheque;
  await runTransaction(firestore,async transaction=>{
    const [checkbookSnapshot,counterSnapshot]=await Promise.all([
      transaction.get(checkbookReference),transaction.get(counterReference)
    ]);
    if(!checkbookSnapshot.exists()) throw new Error("Select a valid checkbook before issuing a cheque.");
    const checkbook=checkbookSnapshot.data();
    const chequeNumber=Number(checkbook.nextChequeNo??checkbook.firstChequeNo);
    if(!Number.isSafeInteger(chequeNumber)||chequeNumber>Number(checkbook.lastChequeNo)) throw new Error("This checkbook has no cheque numbers remaining.");
    const nextDocumentNumber=Number(counterSnapshot.data()?.nextNumber)||1;
    const formattedChequeNumber=String(chequeNumber).padStart(Number(checkbook.chequeNumberWidth)||0,"0");
    issuedCheque={id:chequeReference.id,chequeNumber:formattedChequeNumber,documentNo:`CHQ-${String(nextDocumentNumber).padStart(5,"0")}`};
    const now=serverTimestamp();
    transaction.set(chequeReference,{
      ...data,
      checkbookId,
      checkbookName:checkbook.name,
      bankId:checkbook.bankId,
      bankName:checkbook.bankName,
      chequeNumber:formattedChequeNumber,
      documentNo:issuedCheque.documentNo,
      status:"Issued",
      createdAt:now,
      updatedAt:now
    });
    transaction.update(checkbookReference,{nextChequeNo:chequeNumber+1,updatedAt:now});
    transaction.set(counterReference,{nextNumber:nextDocumentNumber+1});
  });
  return issuedCheque;
}

export async function updateRecord(collectionName, recordId, data){
  if(collectionName==="transactions") return saveTransactionRecord(recordId,data);
  if(collectionName==="clients") return updateClientRecord(recordId,data);
  if(collectionName==="suppliers") return updateSupplierRecord(recordId,data);
  const reference = doc(initFirebase(),collectionName,recordId);
  let editableData = data;
  if(collectionName === "ledger"){
    const snapshot = await getDoc(reference);
    const preset = snapshot.data();
    if(preset?.systemDefault){
      const allowedFields = preset.systemDefaultKey === "bank"
        ? new Set(["openingBalance","bankName","accountHolderName","accountNumber","ifsc","bankBranch"])
        : new Set(["openingBalance"]);
      editableData = Object.fromEntries(Object.entries(data).filter(([key])=>allowedFields.has(key)));
    }
  }
  await updateDoc(reference, {
    ...editableData,
    updatedAt:serverTimestamp()
  });
}

export async function deleteRecord(collectionName, recordId){
  if(collectionName==="transactions") return saveTransactionRecord(recordId,null);
  const reference = doc(initFirebase(),collectionName,recordId);
  if(collectionName === "ledger"){
    const snapshot = await getDoc(reference);
    if(snapshot.data()?.systemDefault) throw new Error("System Cash, Bank, and Sundry Creditors ledgers cannot be deleted.");
    const linkedEntries=await getDocs(query(collection(initFirebase(),"ledger_entries"),where("accountId","==",recordId)));
    if(!linkedEntries.empty) throw new Error("This ledger has posted financial entries. Reverse linked sales, purchases, or transactions before deleting it.");
  }
  if(collectionName==="clients"){
    const snapshot=await getDoc(reference);
    if((Number(snapshot.data()?.receivableBalance)||0)>0) throw new Error("This client has an outstanding sales balance and cannot be deleted.");
  }
  if(collectionName==="suppliers"){
    const snapshot=await getDoc(reference);
    if(Math.abs(Number(snapshot.data()?.payableBalance)||0)>0.005) throw new Error("This supplier has an outstanding payable balance and cannot be deleted.");
    const [purchases,transactions]=await Promise.all([
      getDocs(query(collection(initFirebase(),"purchases"),where("supplierId","==",recordId))),
      getDocs(query(collection(initFirebase(),"transactions"),where("partyId","==",recordId)))
    ]);
    if(!purchases.empty||!transactions.empty) throw new Error("This supplier is linked to purchase or payment records and cannot be deleted.");
  }
  await deleteDoc(reference);
}

export async function getCompany(){
  const firestore = initFirebase();
  const snap = await getDoc(doc(firestore, "company_settings", "master"));
  return snap.exists() ? snap.data() : null;
}

export async function uploadCompanyLogo(file){
  const user = getAuthClient().currentUser;
  if(!user) throw new Error("Sign in before uploading a company logo.");
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP logo.");
  if(file.size > 5 * 1024 * 1024) throw new Error("Company logos must be 5 MB or smaller.");
  const safeName = file.name.replace(/[^a-z0-9._-]/gi,"_").slice(0,100) || "company-logo";
  const storagePath = `company-logos/${user.uid}/${Date.now()}-${safeName}`;
  await uploadBytes(ref(getStorage(getFirebaseApp()),storagePath),file,{contentType:file.type});
  return storagePath;
}

export async function getCompanyLogoBlob(storagePath){
  const user = getAuthClient().currentUser;
  if(!user) throw new Error("Sign in before loading the company logo.");
  return getBlob(ref(getStorage(getFirebaseApp()),storagePath));
}

export async function saveCompany(data){
  const firestore = initFirebase();
  const reference = doc(firestore, "company_settings", "master");
  const existing = await getDoc(reference);
  await setDoc(reference, {
    ...data,
    ...(!existing.exists() ? {createdAt:serverTimestamp()} : {}),
    updatedAt:serverTimestamp()
  }, {merge:true});
}
