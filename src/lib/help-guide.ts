// The user guide shown on the Help page (/help). Each section says who it
// is for; people see their own sections (the Head can show all). Written in
// a small markdown: "### " headings, "- " and "1. " lists, "| " tables,
// **bold** - see src/components/mini-markdown.tsx. Keep it in step with the
// shared "Sakuragi CRM - User Guide" document.

export type HelpAudience = "sales" | "coordinator" | "service" | "head";
export type HelpSection = { id: string; title: string; for: HelpAudience[]; body: string };

const ALL: HelpAudience[] = ["sales", "coordinator", "service", "head"];
const SALES_SIDE: HelpAudience[] = ["sales", "coordinator", "head"];

export function helpAudience(user: { role: string; title?: string | null }): HelpAudience {
  if (user.role === "HEAD") return "head";
  if (user.role === "COORDINATOR") return "coordinator";
  if (user.title === "Service Manager") return "service";
  return "sales";
}

export const HELP_INTRO =
  "The CRM keeps every enquiry, quote, sale and service complaint in one place, so nothing is followed up from memory or WhatsApp alone. Spend five minutes in it at the start and end of each day and it will remind you of everything else.";

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    for: ALL,
    body: `**Logging in.** Open the CRM link in Chrome (phone or laptop) and sign in with the email and password the Head of Sales gave you. Change your password the first time: click **Change password** at the bottom of the menu.

**Put it on your phone.** It works like an app, with no download from the app store:

- **Android (Chrome):** open the CRM, tap the ⋮ menu → **Add to Home screen** (or **Install app**).
- **iPhone:** open it in Safari, tap **Share** → **Add to Home Screen**, then always open it from that icon.

**Turn on notifications.** Tap the **bell** at the top, then switch on **Phone / desktop notifications**. Do this on each phone or laptop you use. You then get pushes for follow-ups due, approvals, service complaints and more, even with the CRM closed.

**Who sees what.** Each person sees the menu for their job:

| Role | Sees |
| --- | --- |
| Sales Manager / Senior Sales Manager | Own leads, deals, quotations, accounts, targets and incentives; products and stock |
| Sales Coordinator | Everyone's sales work, plus billing, imports and team reports; prepares quotes and enters sales for the sales people |
| Service Manager | Service Dashboard, complaints, installed units, AMCs, warranty claims, failure analysis and service/spares quotations; no leads, deals or incentives |
| Head of Sales | Everything, plus approvals, settings and team logins |

The search box at the top finds leads, accounts, products, contacts and deals by name, phone or reference.`,
  },
  {
    id: "dashboard",
    title: "Dashboard and the bell",
    for: ALL,
    body: `The Dashboard answers "how am I doing this month and what do I do today". A sales person's Dashboard is kept short - their figures, pipeline coverage and funnel, quotations to follow up and target vs sales - with links to My Day, Pipeline, Leads and the Sales Register for the rest. The Head and the Coordinator see the whole team in more detail. **Mine / Division** at the top of a sales person's Dashboard switches to the whole division's performance: the team's sales, target and pipeline, coverage and funnel per person, and each person's sales against target - without anyone's customers, deals, activities or incentives.

| Card or chart | What it tells you |
| --- | --- |
| Sales This Month | Invoiced sales so far against this month's target |
| Year to Date | Sales and target since January |
| Open Pipeline | Open deals, their value, and the weighted value (value × winning chance) |
| New Leads This Month | New enquiries, compared with last month |
| Lost This Month | Deals lost and their value - check the reasons |
| Pipeline coverage | Open deals closing in the next 3 months ÷ target still to go. 3× or more is healthy, under 2× the target is at risk - build pipeline now |
| Lead funnel | Last 90 days' leads: how many became deals, got a quote and were won. The smallest % is where leads are lost (▼ in the team table) |
| Quotations to follow up | Quotes sent 7+ days ago with no follow-up (amber at 7 days, red at 14) |
| Target vs sales | Last 6 months: sales against target, with the same month last year (grey bar, and "vs last year" in the table) and a 3-month average line, so a seasonal peak or dip isn't mistaken for a trend |
| Pipeline movement, Pipeline by stage (team) | Are we filling the pipeline as fast as we close it? |
| New leads by sales person | Each sales person's new and active leads and their lead-to-deal conversion |
| Upcoming activities | Calls, visits and meetings due - your to-do list |

The Service Manager's Dashboard is the **Service Dashboard** instead: pending complaints, complaints past their service level, response times, AMCs and warranty claims.

**My Day** (second in the menu) is your to-do list for today: activities due or overdue (tick them off there), quotations to follow up, a "Call these" list of stalled deals and regular customers gone quiet, and what's coming this week. The Service Manager's My Day shows complaints past or near their service level, installations and AMC visits due.

**The bell** collects everything that needs action, with a count: follow-ups due, deals past their close date, discounts waiting for approval, won deals missing an invoice number, stock arrived for balance orders, complaints past their service level, AMCs to renew, warranty claims to raise. Click an item to go straight to it. Clear the bell every day and nothing slips.`,
  },
  {
    id: "leads",
    title: "Leads and activities",
    for: SALES_SIDE,
    body: `A **lead** is any enquiry that isn't a firm requirement yet: a phone call, a walk-in, a referral, a tender notice. Log it the same day so it counts towards your conversion and nobody else chases the same customer.

**On the phone? Quick add.** The **+ Lead** button at the top of every page adds a lead in three fields - who, their phone no., what they need. Fill in the rest (value, equipment, source) later; the bell reminds you a few hours on.

**Add a lead:** Leads & Activities → **New Lead**. Fill in the title, customer name, contact number, company, estimated value, equipment type, source and expected purchase timeframe. Link it to the customer's **account** if they already buy from us. As you type the phone no. or company, the CRM warns if the customer is **already in the CRM** - and whose it is ("Rohan Verma's") - so check with them before adding it. The Head and the Coordinator can save a lead with only a title and fill in the rest later.

**Move it along** by changing its status:

1. **New** - just logged.
2. **Contacted** - you have spoken to them.
3. **Qualified** - real need, budget and timeframe.
4. **Converted** - click **Convert to Deal** when they ask for a quotation; the lead's details carry over.
5. **Unqualified** - not a real prospect; say why in the notes.

**Activities** are your diary: calls, **WhatsApp** messages, **site visits**, emails, meetings, tasks and notes on a lead, deal or account. Calls, WhatsApp, site visits, emails and meetings count as contact with the customer (a deal with none for 14 days is flagged as stalled). Nigerian phone numbers are saved as +234 803 123 4567 however they're typed, so WhatsApp links always work. Add one each time you speak to the customer and set the next one with a due date. Due activities show under **Upcoming activities** on the Dashboard and in the bell.

You don't always need to create the lead by hand: a deal created directly gets its lead made automatically (dated 2 days before), and so does an equipment quotation downloaded without a deal (see Quotations).`,
  },
  {
    id: "deals",
    title: "Deals and the pipeline",
    for: SALES_SIDE,
    body: `A **deal** is a real opportunity with products and a value. The **Pipeline** shows your deals as cards by stage; drag a card to move it.

| Stage | Means |
| --- | --- |
| Qualification | Need confirmed, gathering details |
| Needs Analysis | Site visit, load calculation, product selection |
| Quotation | Quote / PI / BOQ sent |
| Negotiation | Discussing price, terms, delivery |
| Won | Invoiced - counts as your sale |
| Lost | Not going ahead - reason recorded |

**Keep each deal honest:** the expected closure date, winning probability and value drive your forecast. Each stage has its usual probability (Qualification 20%, Needs Analysis 40%, Quotation 60%, Negotiation 80%), set automatically when the deal moves stage. A different figure needs a reason (e.g. "PO promised"), kept as a note on the deal. **Forecast vs actual** (Incentives & Targets) compares each month's forecast, saved on the 1st, with what was actually won from those deals - consistently well under 100% means the forecast is too optimistic. A deal past its close date is flagged in the bell. A deal with **no customer contact for 14 days** (no call, email, meeting, visit or quote sent - editing the deal doesn't count) shows "No contact for N days" on its Pipeline card and in the bell, unless a follow-up is already planned.

**Products come from the quotation.** Once a deal has a quotation, its products, rates and value follow its **latest** downloaded quotation - revise the quotation to change them (they can't be edited on the deal). A deal without a quotation has its products entered on the deal.

**Mark Won** when you invoice. Enter the invoice number, date, billing company (Sakuragi or Somotex) and the products and rates billed. Your achievement comes **only from invoices**: a deal without an invoice number doesn't count towards your target.

**Part billing.** If only some items are in stock, bill what you deliver. The CRM shows "Billed vs the deal" and keeps the rest as a **balance order**, a separate open deal. When the stock arrives the bell says "Stock arrived for balance orders - bill them". If the customer no longer wants them, tick "The customer doesn't want them - drop them". Paid but unbilled items also feed **Reorder Planning**.

**Order checklist.** A won deal shows what's done and what's left: invoiced, account linked, everything billed (or a balance order waiting for stock), **delivered** (click Mark delivered with the date and waybill no.), installed (supply-only sales skip this) and serial nos. The bell reminds you about won orders not marked delivered a week on.

**Mark Lost** asks for the reason (price, competitor, project cancelled...). Be honest - these reasons tell us where we lose business. **Lost on price:** enter the brand they bought and **their price for the same scope** (excl. VAT, even roughly) - the CRM shows how much higher we were, and Team Reports shows the average gap per competitor. A lost or won deal can be reopened if needed.`,
  },
  {
    id: "quotations",
    title: "Quotations, proforma invoices and BOQs",
    for: ALL,
    body: `Every quote, PI and BOQ is made in **Quotations → New quotation**, so prices, discounts and references are always right and every quote is kept.

### Making a quotation

1. Pick the **template**: Equipment, Servicing or Spare parts. Servicing and spares can be issued by Sakuragi or Somotex.
2. Pick the document: Quotation, Proforma Invoice or BOQ.
3. **Sales person:** the Head and the Coordinator pick who the quote is for. The quote, its deal and its lead go to that person. Left on "None", it is saved under your own name.
4. Fill in the customer (To, Kind attention, contact number) and add products from the list. Prices come from the current price list. Use "Custom item" for anything not in the list.
5. Choose "Rates inclusive of VAT" or "Show VAT separately", installation rates if needed, and the validity. Rates inclusive of VAT are always **whole naira, rounded up** (like Excel's CEILING.MATH(rate, 1)) - after any discount or commission.
6. **Sales commission:** tick 5% or 10% when the customer's buyer gets a commission. Every rate is divided by 0.95 or 0.9; this isn't printed.
7. **Download PDF** or **Download Excel**. The first download issues the unique reference number. The final total is rounded off.

**Customer price history.** Once the customer is filled in, each product line shows what that customer was **last quoted** and **last bought at** for that model (after discount, in this quote's VAT terms) - in amber if you're now quoting higher than they last paid.

**Discounts.** The "Disc. %" and "Our cost" columns are not printed. A discount beyond the product's permissible limit goes to the Head for approval (Approvals tab) before the quote can be sent. Items not in stock get a tentative rate and no discount.

**Deal and lead made for you.** An equipment quote downloaded without a deal creates its lead and deal straight away, at the Quotation stage. You're then asked to link the customer's account. Servicing and spares quotes don't create deals. To put a quote on an existing deal, start it from the deal, or use **Link deal** in Saved quotations.

### Other tools in the builder

- **Save as draft** to finish later.
- **Import from Excel** to read a quote made in Excel.
- **Import contractor's bill (add margin)**.
- **Costing sheet (Excel)** shows costs and margins for internal use only.

### Tabs

| Tab | Use it to |
| --- | --- |
| Saved quotations | Find, re-download, revise, send or link any quote |
| Follow-ups | Quotes sent 7+ days ago: record the follow-up, set the next one, or mark lost |
| Report | Quotes issued, value and conversion |
| Approvals | (Head) approve or reject discounts |
| Invoice (balance payment) | Raise a Sakuragi or Somotex invoice claiming a balance payment |

**Send** the quote by WhatsApp or email from the builder, Saved quotations or Follow-ups. The send is logged on the deal and starts the 7-day follow-up reminder. If the price of a product changes after the quote, a warning shows when you reopen it.`,
  },
  {
    id: "accounts",
    title: "Accounts, products, stock and the sales register",
    for: ALL,
    body: `| Menu | What it holds | How it helps you |
| --- | --- | --- |
| Accounts & Contacts | Each customer company and its people, with all their leads, deals, quotes, invoices and activities | Open the account before a call: you see everything we've sold and quoted them |
| Products | Every model with its price list rate and permissible discount | Quote the right price; check specs and prices on the go |
| Stock & Pending Orders | Stock in the warehouse, units arriving, and orders taken for items not in stock | Promise delivery only on what's in stock or arriving |
| Sales Register | Every invoiced line: date, invoice, customer, model, qty, value, sales person | Your real sales, filterable and exportable to Excel |

**Regular customers gone quiet.** Accounts → Win-back starts with customers who bought 2+ times in the last 15 months but haven't ordered for over 3 months - and longer than twice their usual gap. They also show in your bell. Call them: once there's an open deal or any call, visit or note logged with them, they drop off the list.

**Accounts matter.** Link every lead, deal and quote to the customer's account; the CRM asks after a quote is downloaded. Repeat business, warranty and service history all hang off the account.

**Sales Register.** Sales come in from invoices: Mark Won on a deal, or the Head or the Coordinator importing the sales sheet. Sales of upcountry branch sales people are entered by the Head or the Coordinator and show together as **Others** (from 2026). They don't log in.`,
  },
  {
    id: "incentives",
    title: "Targets and incentives",
    for: SALES_SIDE,
    body: `Your incentive is worked out by the CRM from your invoiced sales, so what isn't in the CRM isn't paid.

- **Targets** are set monthly for each sales person by the Head. See yours under **Incentives & Targets**.
- **Achievement** = the month's invoiced sales (product sales plus project billing under your name) ÷ the month's target. Quotes, open deals and part-billed balances don't count until they are invoiced.
- **Incentive rate** depends on achievement, in tiers the Head sets (shown on the Incentives page). Below the lowest tier there's no incentive that month.
- **The split:** an eligible sales person keeps a share; the rest goes to the support staff who helped: coordination, design and service support.
- The page shows the calculation for each month. Each month's incentive is approved by the Head and then shows as approved. If something looks wrong, tell the Head before approval.

**To earn more:** get every invoice onto its deal with Mark Won in the same month, and bill balance orders as soon as stock arrives.`,
  },
  {
    id: "service",
    title: "Service and complaints",
    for: ["service", "coordinator", "head"],
    body: `The service side is run by the Service Manager, with the Head and the Coordinator able to register and follow complaints too. Its menu, **Service & Complaints**, has six tabs: Complaints, Installations, Installed units & warranty, AMC contracts, Warranty claims and Failure analysis.

### Handling a complaint, step by step

1. **Register** it as soon as the customer calls: **Register complaint**, find the sale by invoice number, enter **how many units of each model are faulty** (e.g. 1 of 2 × A and 2 of 3 × B), and their serial nos. if the customer can give them. Then the nature of complaint, date and time, and priority (Normal or Urgent). One complaint is made per faulty unit, so each is tracked, fixed and claimed separately. The warranty (standard 1 year from the invoice) is worked out for you; the Head can override it for exceptional terms, with a reason.
2. **Assign a technician.** The service-level clock is already running.
3. **Attend**: site visit or remote fix. Record what the customer reported, the root cause and what was done.
4. **Serial number.** Optional when registering, because contractors install most units. If not given, enter it after the site visit. The same serial as an earlier complaint means the same unit failing again (a repeat); a different serial is another unit. If the plate isn't visible, or the fault was fixed remotely, pick **Not available** with the reason.
5. **Spares and consumables used**, with our cost. Mark whether each is charged; in warranty, spares are free to the customer (labour-only AMCs still pay for spares). Out of warranty, enter the service charge and the invoice number raised.
6. **Resolve**, then **Close** once the customer confirms. Record the customer rating (1-5).

### Service levels

Each complaint must be assigned, attended and resolved within set hours. The current targets are shown at the bottom of the Complaints page (the Head can change them). By default:

| Priority | Assign within | First visit within | Resolve within |
| --- | --- | --- | --- |
| Normal | 8 h | 24 h | 48 h |
| Urgent | 2 h | 8 h | 24 h |

Resolved complaints should be closed within 3 days. Every complaint shows **On track**, **At risk** (75% of the time gone) or **Breached** for each stage. At risk, the Service Manager gets a phone notification; once breached, the Head and the Coordinator are notified too. Filter the list by "Past service level" or "At risk" each morning.

### Installations (supply + installation orders only)

Most sales - to contractors - are supply only and need nothing here. When **we** supply and install:

1. **Sales hands over** the won deal: on the deal page, **Hand over for installation** with the site address, contact, the customer's preferred date and notes for the installer. If the quotation included installation, the deal page and the bell remind the sales person until it's done.
2. **The Service Manager schedules it**: date and team or contractor (Installations tab). The bell shows installations to schedule and any past their date.
3. **Commission it** after testing: enter each unit's **serial no. from its plate**. They go on the installed units straight away, so later complaints and warranty claims have them. A serial that can't be read needs a reason.
4. The sales person is notified when it's commissioned. If the customer uses their own installer after all, cancel it with the reason.

### The other tabs

| Tab | Use it to |
| --- | --- |
| Installed units & warranty | Every unit sold, with its serial numbers and warranty end date. Warranties ending in 30 days show in the bell, so you can offer an AMC |
| AMC contracts | Maintenance contracts: units covered, visits, labour-only or comprehensive, renewal date. AMCs ending in 30 days show in the bell |
| Warranty claims | Spares given free in warranty are claimed back from Midea. Raise the claim, send the faulty parts back, and chase until credited |
| Failure analysis | Failure rate by model (complaints ÷ units sold), first-year failures, days to failure, top faults and spares used, which spare parts fail most, and failure rate **by quarter of sale** per model - a dark cell points to a bad batch |

**Service and spares quotations.** Use Quotations → Servicing or Spare parts template, issued by Sakuragi or Somotex. These don't create sales deals. Service billing is entered under Project & Service Billing.

**Service Dashboard** (the Service Manager's home page): pending complaints, past service level and at risk, response and resolution times, first-time fix rate, repeat complaints, customer rating, spares cost, AMCs and claims.`,
  },
  {
    id: "management",
    title: "Tools for the Head and the Sales Coordinator",
    for: ["coordinator", "head"],
    body: `The menu is grouped: **Sell**, **Stock**, **Service**, **Reports** and **Settings**. Project & Service Billing, Reorder Planning, Team Reports and everything under Settings are for the Head and the Coordinator; a few Settings items are for the Head only.

| Menu | Use it to |
| --- | --- |
| Team Reports | Target vs achievement, sales breakdown by person, category and month, pipeline, conversion, response times and activity, with Excel export |
| Data Health | Duplicates, incomplete records and orphans to fix; each line links to the fix |
| Recycle Bin | Restore anything deleted by mistake |
| Change History | Who changed what, and when |
| Project & Service Billing | Enter project billing under a sales person (counts toward their target) or service billing under the Service Manager |
| Reorder Planning | What to order from Midea, from stock, sales rate, lead time and paid-but-unbilled orders |
| Import Data | Upload the sales register, price list, stock, leads and won deals from Excel |
| Exchange Rate, Company Details | Rates and the company letterhead, bank and TIN details used on documents |
| Team & Logins | Add people, set designation and access, reset passwords (Head) |

**Entering for others.** The Head and the Coordinator can create leads, deals and quotes for any sales person: pick them in **Owner** or **Sales person**. Branch sales are entered under the person's name and show as "Others".

**Approvals.** The Head approves discounts beyond the limit (Quotations → Approvals) and each month's incentives.`,
  },
  {
    id: "routine",
    title: "Daily routine and FAQ",
    for: ALL,
    body: `### A 10-minute routine for each role

| Role | Morning | During the day | Before leaving |
| --- | --- | --- | --- |
| Sales person | Clear the bell; check Upcoming activities and Quotation follow-ups | Log every new enquiry as a lead; make every quote in the CRM; Mark Won with the invoice the day you bill | Log today's calls and visits; set the next activity on each open deal |
| Sales Coordinator | Clear the bell; team follow-ups due; balance orders with stock arrived | Prepare quotes for the sales people (pick the sales person); enter branch and project billing | Check won deals missing invoice numbers |
| Service Manager | Filter complaints "Past service level" and "At risk"; assign technicians | Update each complaint after the visit: serial no., spares, resolution | Close resolved complaints; raise warranty claims for free spares |
| Head of Sales | Dashboard and bell: approvals, stalled deals, service breaches | Team Reports for reviews | Approve incentives at month end |

### FAQ

- **My sale isn't showing in my achievement.** Only invoiced sales count. Check the deal is Won with its invoice number, date and products.
- **The quote has someone else's initials in the reference.** The reference uses the sales person's initials. Change the Sales person before the first download, or the reference is reissued on the next download.
- **My quote is "waiting for approval".** A discount is beyond the limit, so the Head must approve it before you can send it. You'll be notified.
- **I deleted something by mistake.** Ask the Head or the Coordinator to restore it from the Recycle Bin.
- **I'm not getting notifications.** Turn them on from the bell on each device. On iPhone, open the CRM from the Home Screen icon first.
- **The customer has no invoice for the unit with a complaint.** Enter the invoice date if known; without it the unit is treated as out of warranty unless the Head overrides it.

Questions or something not working? Tell the Head of Sales.`,
  },
];
