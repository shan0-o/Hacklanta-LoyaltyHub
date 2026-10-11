---
name: Loyalty product boundaries
description: Customer-initiated staff approval and the hackathon MVP scope.
---

Keep loyalty approvals customer-initiated: staff enter the business PIN on the customer's device for each stamp or redemption. Do not reintroduce merchant balance-editing controls, QR scanning, receipt uploads, or POS integrations.

**Why:** The user wants a hackathon MVP that works like a paper punch card and minimizes employee work; the merchant dashboard is for management and analytics, not checkout.

**How to apply:** Preserve this workflow when expanding loyalty features. Staff PIN is explicitly an MVP convenience; stronger staff verification can replace it later without moving transaction authority to the client.

Keep demo data explicitly identified, and require owners to set their own demo staff PIN.

**Why:** The user requires persistent, real demo transactions without hardcoded authorization or simulated production success.

**How to apply:** Demo helpers may seed sample balances but must use the same approval and redemption services afterward.
