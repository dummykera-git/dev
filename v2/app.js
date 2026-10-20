const MODULES = [
  {name:"Dashboard", file:"dashboard.html", icon:"layout-dashboard"},
  {name:"CRM", file:"crm.html", icon:"users-round"},
  {name:"Accounts", file:"accounts.html", icon:"wallet"},
  {name:"Employees", file:"employees.html", icon:"contact-round"},
  {name:"GST", file:"gst.html", icon:"file-check-2"},
  {name:"Inventory", file:"inventory.html", icon:"boxes"},
  {name:"Settings", file:"settings.html", icon:"settings-2"},
  {name:"Data", file:"data.html", icon:"database"},
  {name:"Tools", file:"tools.html", icon:"wrench"},
  {name:"Report", file:"report.html", icon:"chart-no-axes-combined"},
  {name:"Notification", file:"notification.html", icon:"bell", badge:"3"},
  {name:"Users", file:"users.html", icon:"user-round-cog"},
  {name:"About app", file:"about-app.html", icon:"info"},
  {name:"Templates", file:"templates.html", icon:"files"},
  {name:"BIQ AI", file:"biq-ai.html", icon:"sparkles"},
  {name:"Payment Gateway", file:"payment-gateway.html", icon:"credit-card"},
  {name:"More", file:"more.html", icon:"grid-2x2"}
];

const navIcon = (name) => `<i data-lucide="${name}"></i>`;
const sideNav = document.getElementById("sideNav");
const bottomNav = document.getElementById("bottomNav");
const currentFile = (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();

if (sideNav) {
  sideNav.innerHTML = MODULES.map(m => `
    <a class="nav-link ${m.file === currentFile ? "active" : ""}" href="${m.file}" title="${m.name}">
      ${navIcon(m.icon)}<span>${m.name}</span>${m.badge ? `<b class="nav-badge">${m.badge}</b>` : ""}
    </a>`).join("");
}
const mobileModules = [
  MODULES[0], MODULES[1], MODULES[2],
  {name:"Create",file:"tools.html",icon:"plus"},
  MODULES[4], MODULES[10], MODULES[16]
];
if (bottomNav) {
  bottomNav.innerHTML = mobileModules.map((m, i) => {
    if (m.name === "Create") return `<a href="${m.file}" class="bottom-add" aria-label="Create new"><i data-lucide="plus"></i></a>`;
    return `<a href="${m.file}" class="${m.file === currentFile ? "active" : ""}" aria-label="${m.name}">${navIcon(m.icon)}<span>${m.name}</span>${m.badge ? `<b class="nav-badge">${m.badge}</b>` : ""}</a>`;
  }).join("");
}
if (window.lucide) lucide.createIcons();

const sidebar = document.getElementById("sidebar");
const scrim = document.getElementById("mobileScrim");
document.getElementById("mobileMenu")?.addEventListener("click", () => {
  sidebar?.classList.add("open"); scrim?.classList.add("show");
});
scrim?.addEventListener("click", () => {
  sidebar?.classList.remove("open"); scrim.classList.remove("show");
});
document.getElementById("sidebarToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-collapsed");
});
document.getElementById("themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const icon = document.querySelector("#themeToggle i");
  if (icon) icon.setAttribute("data-lucide", document.body.classList.contains("dark") ? "moon" : "sun");
  if (window.lucide) lucide.createIcons();
});
document.querySelectorAll("[data-link]").forEach(el => el.addEventListener("click", () => location.href = el.dataset.link));

const search = document.getElementById("globalSearch");
search?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const q = search.value.trim().toLowerCase();
    const match = MODULES.find(m => m.name.toLowerCase().includes(q) || m.file.replace(".html","").replaceAll("-"," ").includes(q));
    if (match) location.href = match.file;
  }
});
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); search?.focus();
  }
});

// The dashboard uses sample presentation data until your Firebase collections are connected.
const greeting = document.getElementById("greeting");
if (greeting) {
  const hour = new Date().getHours();
  const word = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  greeting.innerHTML = `Good ${word}, <span>Mohammed Shanid.</span>`;
}
