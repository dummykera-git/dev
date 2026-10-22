# COREBIQ CRM + ERP — Fresh Module Architecture Sample

A clean, mobile-first COREBIQ CRM/ERP starter built around a single dashboard shell.

## Architecture

- `login.html` — Firebase Authentication sign-in and account creation
- `index.html` — authenticated application shell
- `css/corebiq.css` — shared design system (kept unchanged)
- `js/app.js` — module router/loader
- `js/firebase-config.js` — Firebase placeholder
- `js/firebase-service.js` — Authentication and Firestore service helpers
- `modules/*.html` — module UI only
- `modules/*.js` — module logic
- `modules/*.css` — module-specific styling

## Important module-loading approach

The shell fetches a module HTML file and inserts it into `#moduleContainer`.
It then dynamically imports the matching module JS file.

This avoids the common problem where `<script>` tags inside HTML injected with
`innerHTML` do not execute.

Example:

    app.loadModule("company");

Module registry is in `js/app.js`.

## Included sample modules

Dashboard, Company, Branches, Clients, Suppliers, Staff, Products, Services, Sales,
Sales Return, Purchases, Purchase Return, Estimates, Contra, Payment, Receipt,
Journal, Cheque Transactions, Invoices, Invoice Template, Expenses, Ledger,
Payments, QR, Reports, Settings, COREBIQ AI Assistant.

## Firebase / Firestore

The app uses the project configuration in `js/firebase-config.js`. Record
modules read and write the matching Firestore collections: `branches`,
`clients`, `suppliers`, `staff`, `products`, `product-categories`, `services`,
`service-categories`, `sales`, `purchases`, `invoices`, `expenses`,
`transactions`, `sales_returns`, `purchase_returns`, `estimates`,
`contra_vouchers`, `journal_vouchers`, `ledger`, `ledger_entries`,
`checkbooks`, `cheques`,
`payments`, `qr`, `reports`, and `settings`. The company profile is stored in
`company_settings/master`.

Invoice Template settings are saved on the company profile and use Company
Profile details plus Ledger bank accounts. Sales email and WhatsApp actions open
prefilled message drafts for review and sending in the chosen app.

Sales records support multiple product or service lines and post the gross
amount as a debit to the selected Cash/Bank ledger or Client receivable, with a
matching credit to the selected Sales/Income ledger. Product stock and client
receivable balances are updated with the sale; edits and deletions reverse the
previous posting before applying the new one. Sale journal entries are stored
in `ledger_entries`. Tax is calculated from each inventory item's tax rate and
is suppressed when the Company Profile tax registration type is Unregistered.
Product records can store an HSN code and a separate Purchase Rate in the
product form; Purchase Rate is used to prefill purchase lines while sales keep
using the standard Rate. The HSN field remains available when tax registration is unregistered,
while tax-rate fields remain hidden; HSN is carried into sale lines and
invoices only when tax applies under the Company Profile settings.

Client records use stable Client IDs and include contact and address details,
an opening balance, and a calculated due balance. The due starts at the opening
balance, increases with credit sales, and decreases with client receipts.
Editing the opening balance, sales, or receipts adjusts the due in Firestore
transactions so concurrent account activity is preserved.

Supplier records use stable Supplier IDs and track an opening payable balance.
Purchases can include Products and Services; product stock increases on save
and is reversed correctly on edits and deletions. Each purchase posts to a
Purchase/Expense ledger and is credited to Cash/Bank or the protected Sundry
Creditors liability ledger, with the selected supplier tracked as a subledger.
Supplier payments reduce the payable balance and post matching Sundry
Creditors and Cash/Bank ledger entries. Supplier balances, purchase stock,
and journal entries are updated atomically.

Accounts also includes Contra vouchers for balanced Cash/Bank transfers and
Journal vouchers that debit one selected ledger and credit another. Sales and Purchase Returns
are linked to their original transaction, enforce returnable quantities, and
reverse related stock, party balances, and ledger entries. Estimates do not
post to stock or accounts; an estimate can be converted to a Sales record once.
Payment and Receipt are separate screens over the shared transaction workflow.
Both use Cash/Bank for the payment or receipt mode and the full Ledger list for
the counter-ledger; payments debit the selected ledger and credit Cash/Bank,
while receipts debit Cash/Bank and credit the selected ledger.

Journal vouchers record a date, Ledger in, Ledger out, amount, and narration.
The selected Ledger in is debited and Ledger out is credited by the same amount.

Company Profile stores the UPI ID used by Invoice Template and sales invoice
PDFs. The ID can be updated in either Company Profile or Invoice Template.
Invoices can include a locally generated UPI payment QR prefilled with the
invoice total and selected bank transfer details. UPI QR payments require INR;
QR generation runs in the browser and does not send payment data to an
external QR service.

Receipt Voucher Template is available under Templates. It stores its style
separately from the Sales Invoice Template and is applied to printed Receipt
vouchers, including the Company Profile logo when enabled.

Invoice Template also creates Professional/Service and Inventory-wise invoices
from saved Client, Service, Product, Expense-ledger, and QR records. It stores
GST, advance, balance, and amount-in-words details in the `invoices` collection.

The Ledger module creates protected Cash and Bank accounts under Assets and a
Sundry Creditors account under Liabilities. Their names and categories are
fixed; Cash and Sundry Creditors allow opening-balance edits, while Bank also
allows bank account details. These preset accounts cannot be deleted. The ledger
list uses the assigned Ledger ID, account head, account type, opening/current
balance, and Dr/Cr balance side; its view action opens the full account details.

Contra vouchers transfer a single amount from one Cash/Bank ledger to another.
The incoming ledger is debited and the outgoing ledger is credited; each voucher
stores its generated Contra ID, date, amount, narration, and reference number.

Company logos are stored in Firebase Storage at `company-logos/{uid}/...`; add
authenticated Storage rules for that path so signed-in users can upload and
preview their company's logo.

Enable Email/Password in Firebase Authentication and create an account through
`login.html`; registration saves the entered name to the Auth profile. The
header profile shows Auth name/email and the `role`, `userRole`, `user_role`,
or `admin` custom claim (falling back to `User`). Deploy Firestore rules that
authorize only authenticated users and scope records to the intended
organization. This repository does not deploy project rules; permission
errors are shown rather than replaced with sample data. Do not make these
collections publicly writable.

The notification bell opens `license.html`, which reads
`app_licenses/{uid}`. Supported fields are `licenseInfo`, `validTill`,
`planName` (`Demo`, `Base`, `Enterprise`, or `Pro`), and `appVersion`. Accounts
without a license record display the Demo defaults.

Record modules provide text search, value filters, sorting, CSV record import,
Record modules provide text search, value filters, date-range filtering, and
sorting. CSV export downloads the filtered records; PDF export uses the browser
print dialog. Each record displays a stable module-prefixed document number,
such as `SAL-00001`, generated independently of its Firebase document ID.

The AI Assistant directs plan-upgrade inquiries through icon-only WhatsApp,
telephone, and email actions. WhatsApp and email use a generic prefilled plan
inquiry; the user's prompt is not forwarded.
