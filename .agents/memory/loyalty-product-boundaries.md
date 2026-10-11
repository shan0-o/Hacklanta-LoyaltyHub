---
name: Loyalty product boundaries
description: Customer-initiated staff approval and the hackathon MVP scope.
---

Keep loyalty approvals customer-initiated: staff enter the business PIN on the customer's device for each stamp or redemption. Do not reintroduce merchant balance-editing controls, QR scanning, receipt uploads, or POS integrations.

**Why:** The user wants a hackathon MVP that works like a paper punch card and minimizes employee work; the merchant dashboard is for management and analytics, not checkout.

**How to apply:** Preserve this workflow when expanding loyalty features. Staff PIN is explicitly an MVP convenience; stronger staff verification can replace it later without moving transaction authority to the client.

The app name is LoyaltyHub. Keep demo data explicitly identified and private to the account that loaded it.

**Why:** The user requested LoyaltyHub branding and removal of repeated sample data, while retaining persistent demo transactions.

**How to apply:** Demo helpers may seed sample balances but must use the same approval and redemption services afterward.

Staff approval codes must be app-generated, exactly four digits, change every three hours, and carry a “do not share” warning wherever merchants can view them. Do not restore manually chosen PINs.

**Why:** The user explicitly requested these security and usability rules.

**How to apply:** Owner-only disclosure is separate from customer snapshots; expired codes must fail server-side even if the app has been closed.

Keep the customer experience centered on My Cards and Discover, without a separate Home page or customer perk-point display. Preserve merchant navigation and the merchant retention dashboard when reorganizing customer pages.

**Why:** The user explicitly limited this simplification to customer navigation and page organization.

**How to apply:** Reuse existing cards, transaction history, promotions, and approval flows rather than inventing replacement loyalty logic.
