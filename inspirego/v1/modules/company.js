import { getCompany, saveCompany } from "../js/firebase-service.js?v=11";

const fields = [
  "cmp_name","cmp_biz_type","cmp_email","cmp_phone","cmp_alt_phone",
  "cmp_website","cmp_reg_no","cmp_pan","cmp_gstin","cmp_cin","cmp_floor","cmp_building_name",
  "cmp_area","cmp_district","cmp_state","cmp_pincode","cmp_country","cmp_currency","cmp_fy_start",
  "cmp_timezone","cmp_date_format","cmp_tax_type","cmp_tax_rate","cmp_inv_prefix","cmp_inv_start",
  "cmp_bank_name","cmp_acc_name","cmp_acc_no","cmp_ifsc","cmp_bank_branch","cmp_upi_id"
];

const countryDefaults = {
  Australia:{currency:"AUD",fyStart:"July",timezone:"Australia/Sydney",dateFormat:"DD/MM/YYYY",taxRate:"10"},
  Canada:{currency:"CAD",fyStart:"January",timezone:"America/Toronto",dateFormat:"YYYY-MM-DD",taxRate:"5"},
  China:{currency:"CNY",fyStart:"January",timezone:"Asia/Shanghai",dateFormat:"YYYY-MM-DD",taxRate:"13"},
  France:{currency:"EUR",fyStart:"January",timezone:"Europe/Paris",dateFormat:"DD/MM/YYYY",taxRate:"20"},
  Germany:{currency:"EUR",fyStart:"January",timezone:"Europe/Berlin",dateFormat:"DD.MM.YYYY",taxRate:"19"},
  India:{currency:"INR",fyStart:"April",timezone:"Asia/Kolkata",dateFormat:"DD-MM-YYYY",taxRate:"18"},
  Japan:{currency:"JPY",fyStart:"April",timezone:"Asia/Tokyo",dateFormat:"YYYY/MM/DD",taxRate:"10"},
  Malaysia:{currency:"MYR",fyStart:"January",timezone:"Asia/Kuala_Lumpur",dateFormat:"DD/MM/YYYY",taxRate:"8"},
  "New Zealand":{currency:"NZD",fyStart:"April",timezone:"Pacific/Auckland",dateFormat:"DD/MM/YYYY",taxRate:"15"},
  "Saudi Arabia":{currency:"SAR",fyStart:"January",timezone:"Asia/Riyadh",dateFormat:"DD/MM/YYYY",taxRate:"15"},
  Singapore:{currency:"SGD",fyStart:"January",timezone:"Asia/Singapore",dateFormat:"DD/MM/YYYY",taxRate:"9"},
  "South Africa":{currency:"ZAR",fyStart:"March",timezone:"Africa/Johannesburg",dateFormat:"YYYY-MM-DD",taxRate:"15"},
  "United Arab Emirates":{currency:"AED",fyStart:"January",timezone:"Asia/Dubai",dateFormat:"DD-MM-YYYY",taxRate:"5"},
  "United Kingdom":{currency:"GBP",fyStart:"April",timezone:"Europe/London",dateFormat:"DD/MM/YYYY",taxRate:"20"},
  "United States":{currency:"USD",fyStart:"January",timezone:"America/New_York",dateFormat:"MM/DD/YYYY",taxRate:""}
};

const bankCodeLabels = {
  Australia:"BSB Number",
  Canada:"Transit / Institution Number",
  China:"CNAPS / Clearing Code",
  France:"BIC / SWIFT Code",
  Germany:"BIC / SWIFT Code",
  India:"IFSC Code",
  Japan:"Bank / Branch Code",
  Malaysia:"SWIFT / BIC Code",
  "New Zealand":"Bank / Branch Number",
  "Saudi Arabia":"IBAN / SWIFT Code",
  Singapore:"Bank / Branch Code",
  "South Africa":"Branch Code",
  "United Arab Emirates":"IBAN / SWIFT Code",
  "United Kingdom":"Sort Code",
  "United States":"ABA Routing Number"
};

const phoneCountries = [
  {name:"Australia",code:"+61",min:9,max:9},
  {name:"Canada",code:"+1",min:10,max:10},
  {name:"China",code:"+86",min:11,max:11},
  {name:"France",code:"+33",min:9,max:9},
  {name:"Germany",code:"+49",min:7,max:11},
  {name:"India",code:"+91",min:10,max:10},
  {name:"Japan",code:"+81",min:9,max:10},
  {name:"Malaysia",code:"+60",min:8,max:10},
  {name:"New Zealand",code:"+64",min:8,max:10},
  {name:"Saudi Arabia",code:"+966",min:9,max:9},
  {name:"Singapore",code:"+65",min:8,max:8},
  {name:"South Africa",code:"+27",min:9,max:9},
  {name:"United Arab Emirates",code:"+971",min:9,max:9},
  {name:"United Kingdom",code:"+44",min:10,max:10},
  {name:"United States",code:"+1",min:10,max:10}
];

const phoneFields = [
  {id:"cmp_phone",countryId:"cmp_phone_country"},
  {id:"cmp_alt_phone",countryId:"cmp_alt_phone_country"}
];

let original = {};

function el(id){ return document.getElementById(id); }

function syncTaxRateVisibility(){
  el("cmp_tax_rate").closest(".form-group").hidden = String(el("cmp_tax_type").value).toLowerCase() === "unregistered";
}

function setupPhoneFields(){
  phoneFields.forEach(({countryId})=>{
    const select = el(countryId);
    select.innerHTML = phoneCountries.map(country=>`<option value="${country.name}">${country.code} ${country.name}</option>`).join("");
  });
}

function updatePhoneValidity(inputId,countryId){
  const input = el(inputId);
  const country = phoneCountries.find(item=>item.name === el(countryId).value);
  const digits = input.value.replace(/\D/g,"");
  const normalizedDigits = country.code !== "+1" && digits.startsWith("0") ? digits.slice(1) : digits;
  const invalidCharacters = input.value && !/^[\d\s()+.-]+$/.test(input.value);
  const invalidLength = input.value.trim() && (!normalizedDigits || normalizedDigits.length < country.min || normalizedDigits.length > country.max);
  const lengthMessage = `Enter a valid ${country.name} phone number (${country.min}${country.max === country.min ? "" : `-${country.max}`} digits).`;
  input.setCustomValidity(invalidCharacters ? "Use digits and standard phone-number separators only." : invalidLength ? lengthMessage : "");
}

function setPhoneCountryFromValue(inputId,countryId,number,preferredCountry){
  let value = String(number || "").trim();
  let country = phoneCountries.find(item=>item.name === preferredCountry) || phoneCountries.find(item=>item.name === "India");
  if(value.startsWith("+")){
    const digits = value.replace(/\D/g,"");
    const matchingCountries = phoneCountries.filter(item=>digits.startsWith(item.code.slice(1)))
      .sort((left,right)=>right.code.length-left.code.length);
    const preferredMatch = matchingCountries.find(item=>item.name === preferredCountry);
    country = preferredMatch || matchingCountries[0] || country;
    if(digits.startsWith(country.code.slice(1))) value = digits.slice(country.code.slice(1).length);
  }
  el(countryId).value = country.name;
  el(inputId).value = value;
  updatePhoneValidity(inputId,countryId);
}

function getInternationalPhone(inputId,countryId){
  const digits = el(inputId).value.replace(/\D/g,"");
  if(!digits) return "";
  const country = phoneCountries.find(item=>item.name === el(countryId).value);
  const nationalDigits = country.code !== "+1" && digits.startsWith("0") ? digits.slice(1) : digits;
  return `${country.code}${nationalDigits}`;
}

function setPhoneEditing(value){
  phoneFields.forEach(({id,countryId})=>{
    el(id).disabled = !value;
    el(countryId).disabled = !value;
  });
}

function updateBankCodeLabel(country){
  const label = bankCodeLabels[country] || "Bank / Routing Code";
  el("cmp_ifsc_label").textContent = label;
  el("cmp_ifsc").placeholder = `Enter ${label.toLowerCase()}`;
}

function setSelectValue(id,value){
  const select = el(id);
  if(!value) return;
  if(!Array.from(select.options).some(option=>option.value === value)){
    select.add(new Option(value,value));
  }
  select.value = value;
}

function applyCountryDefaults(country){
  updateBankCodeLabel(country);
  const defaults = countryDefaults[country];
  if(!defaults) return;
  setSelectValue("cmp_currency",defaults.currency);
  setSelectValue("cmp_fy_start",defaults.fyStart);
  setSelectValue("cmp_timezone",defaults.timezone);
  setSelectValue("cmp_date_format",defaults.dateFormat);
  setSelectValue("cmp_tax_type","Registered");
  el("cmp_tax_rate").value = defaults.taxRate;
  syncTaxRateVisibility();
}

function setEditing(value){
  fields.forEach(id=>{ if(el(id)) el(id).disabled = !value; });
  setPhoneEditing(value);
  el("companyViewActions").style.display = value ? "none" : "flex";
  el("companyEditActions").style.display = value ? "flex" : "none";
  if(value) el("cmp_name")?.focus();
}

function populate(data){
  el("cmp_id").value = "master";
  const phoneValues = Object.fromEntries(phoneFields.map(({id})=>[id,data[id] || ""]));
  const addressValues = {
    cmp_building_name:data.cmp_building_name ?? data.cmp_addr1 ?? "",
    cmp_area:data.cmp_area ?? data.cmp_addr2 ?? data.cmp_city ?? "",
    cmp_pincode:data.cmp_pincode ?? data.cmp_pin ?? ""
  };
  fields.forEach(id=>{
    if(el(id)){
      if(phoneFields.some(phone=>phone.id === id)) return;
      if(el(id) instanceof HTMLSelectElement) setSelectValue(id,data[id] ?? "");
      else el(id).value = addressValues[id] ?? data[id] ?? "";
    }
  });
  if(!data.cmp_country) el("cmp_country").value = "India";
  phoneFields.forEach(({id,countryId})=>setPhoneCountryFromValue(id,countryId,phoneValues[id],el("cmp_country").value));
  updateBankCodeLabel(el("cmp_country").value);
  const defaults = countryDefaults[el("cmp_country").value];
  if(defaults){
    if(!data.cmp_currency) setSelectValue("cmp_currency",defaults.currency);
    if(!data.cmp_fy_start) setSelectValue("cmp_fy_start",defaults.fyStart);
    if(!data.cmp_timezone) setSelectValue("cmp_timezone",defaults.timezone);
    if(!data.cmp_date_format) setSelectValue("cmp_date_format",defaults.dateFormat);
    if(!data.cmp_tax_type) setSelectValue("cmp_tax_type","Registered");
    if(!data.cmp_tax_rate) el("cmp_tax_rate").value = defaults.taxRate;
  }
  syncTaxRateVisibility();
}

async function load(){
  el("companyLoader").style.display = "grid";
  el("companyForm").style.display = "none";

  let data;
  try{
    data = await getCompany() || {};
  }catch(error){
    el("companyLoader").innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load company profile from Firebase.</p><small>${String(error.message || "Check Firebase configuration and Firestore access rules.")}</small></div>`;
    return;
  }

  original = structuredClone(data);
  populate(data);

  el("companyLoader").style.display = "none";
  el("companyForm").style.display = "block";
  setEditing(false);
}

export async function init(){
  setupPhoneFields();
  el("companyEdit").addEventListener("click",()=>setEditing(true));
  el("companyRefresh").addEventListener("click",load);
  el("cmp_country").addEventListener("change",event=>{
    applyCountryDefaults(event.target.value);
    phoneFields.forEach(({countryId})=>{
      if(phoneCountries.some(country=>country.name === event.target.value)) el(countryId).value = event.target.value;
    });
    phoneFields.forEach(({id,countryId})=>updatePhoneValidity(id,countryId));
  });
  el("cmp_tax_type").addEventListener("change",syncTaxRateVisibility);
  phoneFields.forEach(({id,countryId})=>{
    el(id).addEventListener("input",()=>updatePhoneValidity(id,countryId));
    el(countryId).addEventListener("change",()=>updatePhoneValidity(id,countryId));
  });

  el("companyCancel").addEventListener("click",()=>{
    populate(original);
    setEditing(false);
  });

  el("companyForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const saveButton = el("companySave");

    const data = {};
    fields.forEach(id=>data[id]=el(id)?.value || "");
    phoneFields.forEach(({id,countryId})=>data[id]=getInternationalPhone(id,countryId));
    const invalidPhone = phoneFields.find(({id,countryId})=>{
      updatePhoneValidity(id,countryId);
      return !el(id).checkValidity();
    });
    if(invalidPhone){
      el(invalidPhone.id).reportValidity();
      return;
    }
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="material-symbols-rounded">sync</span> Saving...`;
    try{
      await saveCompany(data);
      original = structuredClone(data);
      populate(data);
      setEditing(false);
      window.showToast?.("Company profile saved.");
    }catch(error){
      window.showToast?.(error.message || "Could not save company profile.");
    }finally{
      saveButton.disabled = false;
      saveButton.innerHTML = `<span class="material-symbols-rounded">save</span> Save Company`;
      window.COREBIQ?.renderIcons(saveButton);
    }
  });

  await load();
}
