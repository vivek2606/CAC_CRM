# Quote follow-ups, price changes and sending

## Follow-up reminders
- A quotation or proforma that has been sent (downloaded, or sent from the CRM) and not converted is **due a follow-up 7 days later**. It shows amber at 7 days old and red at 14 days.
- It appears on the sales person's **dashboard**, in the **Quotations → Follow-ups** tab (the team's for the Head and the Coordinator) and in the **notification bell** and morning push.
- **Follow up** records how (call, WhatsApp, email, meeting) and what the customer said as an activity on the deal, then sets the next reminder (2–30 days).
- **Mark lost** asks for the reason. A quote on an open deal marks the deal Lost too.
- A completed activity logged on the deal also counts as a follow-up. Winning or losing the deal ends the reminders.
- Quotes older than 120 days drop off the list.

## Price list effective dates
- The Price Master and Stock & Price List uploads take an optional **"Prices effective from"** date. Prices uploaded early don't apply until that date. Without a date, a price applies from the 1st of its month, as before.
- A saved quote reopened in the builder shows a warning when its products' prices have changed since its date, or are about to change, for example "price increased from ₦1,400 to ₦1,500 on 01/10/2026".
- The same warning shows on follow-ups, and the bell shows "Prices changed on N open quotations".

## Sending by WhatsApp / email
- **Send** appears in the builder (after the first download), in Saved quotations and on each follow-up.
- **WhatsApp** opens a chat with the customer's number, with a message and a link to the PDF. On a phone you can share the PDF file itself instead.
- **Email** opens the sales person's mail app with the message and link. If email from the CRM is set up (below), it sends from the CRM with the PDF attached and copies the sales person.
- Every send is logged as an activity on the deal (or the account) and starts the quote's follow-up reminder.
- The PDF link works without logging in for 60 days. It is signed, so it can't be guessed or changed. It always shows the latest saved version of the quotation. A quote waiting on a discount approval can't be sent.

### Optional: email from the CRM (Resend)
1. Create a free account at resend.com and verify your company domain.
2. In Vercel → Project → Settings → Environment Variables add:
   - `RESEND_API_KEY` – the API key from Resend
   - `QUOTE_EMAIL_FROM` – e.g. `Sakuragi Sales <sales@yourdomain.com>`
3. Redeploy. The email box then says "PDF attached, you're copied".
