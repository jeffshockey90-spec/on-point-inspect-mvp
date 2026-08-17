# Apple In-App Purchase Setup (App Store Guideline 3.1.1)

App Review rejected FLOW under Guideline 3.1.1 / 3.1.3(d): the Enterprise
Services exception only covers services sold to organizations for groups of
employees or students, and FLOW is sold to individual inspectors. So the
subscription has to be purchasable with In-App Purchase inside the iOS app.

Guideline **3.1.3(b) (Multiplatform Services)** then lets us keep honoring
subscriptions bought on the web with Stripe. That is why existing web
subscribers see no change on iOS, and why Apple only takes a cut of purchases
that actually originate in the app.

## What the code already does

| Area | File |
| --- | --- |
| Apple entitlement columns + updated RLS gate | `supabase/add-apple-iap.sql` |
| Entitlement rules (Stripe **or** Apple) | `lib/entitlements.ts` |
| StoreKit purchase / restore UI | `components/IOSSubscribeButton.tsx` |
| RevenueCat client config | `lib/revenuecat.ts` |
| Renewals, cancellations, expirations | `app/api/revenuecat/webhook/route.ts` |
| Instant grant after purchase | `app/api/revenuecat/sync/route.ts` |
| Server-side iOS shell detection | `lib/iosShell.ts` |

Entitlement is the OR of the two billing sources. Stripe keeps writing
`subscription_status`; Apple state lands in the `apple_*` columns. Neither
overwrites the other.

## Steps to go live

### 1. Run the migration

Supabase SQL Editor → run `supabase/add-apple-iap.sql`.

This adds the `apple_*` columns and **replaces** `can_create_inspection()` so an
App Store subscriber passes the row-level-security gate. Without it, an IAP buyer
gets through the in-app check and is then rejected by the database on insert.

### 2. Create the subscription in App Store Connect

- My Apps → FLOW → Subscriptions → new subscription group.
- Add an auto-renewable subscription, note the **product ID**.
- Set the price. It does not have to match the $69 web price — pricing it at $79
  covers Apple's cut, and Apple does not require parity.
- Fill in the localized display name, description, and review screenshot.
  Missing metadata here is its own rejection reason.
- Apply for the **Small Business Program** if you haven't. It drops Apple's cut
  from 30% to 15% and you're well under the $1M threshold.

### 3. Set up RevenueCat

- Create a project, add an iOS app with your bundle ID
  (`com.onpointhomeinspect.inspect`).
- Upload the App Store Connect **In-App Purchase Key** and shared secret.
- Add the product, attach it to an entitlement, and put that entitlement in the
  **current** offering — `getOfferings()` reads `offerings.current`, so a product
  outside it will not appear and the paywall will render empty.
- Default entitlement id is `pro`; override with `REVENUECAT_ENTITLEMENT_ID`.
- Integrations → Webhooks → point at
  `https://app.flowinspect.app/api/revenuecat/webhook`, with the Authorization
  header set to the same value as `REVENUECAT_WEBHOOK_SECRET`.

### 4. Environment variables

```bash
NEXT_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...   # public iOS SDK key
REVENUECAT_SECRET_KEY=sk_...                  # server key, for the sync endpoint
REVENUECAT_WEBHOOK_SECRET=...                 # must match the webhook header
REVENUECAT_ENTITLEMENT_ID=pro                 # optional, defaults to "pro"
```

### 5. Xcode

- Add the **In-App Purchase** capability to the app target.
- `npx cap sync ios` to pick up the RevenueCat plugin.
- Rebuild. The build must be new for the `appendUserAgent` marker in
  `capacitor.config.ts` to take effect — see "Verify" below.

### 6. Sandbox test on a real device

Simulator cannot complete StoreKit purchases. On a device with a sandbox Apple ID:

1. Burn the 3 free inspections, confirm the paywall appears.
2. Buy — confirm access is granted immediately (that is the sync endpoint, not
   the webhook).
3. Kill and reopen the app, confirm access persists.
4. Delete and reinstall, tap **Restore Purchases**, confirm access returns.
   Review tests this specifically.
5. Confirm a Stripe-subscribed account sees no paywall at all on iOS.

## Verify the iOS detection works

`lib/iosShell.ts` keys off a user-agent marker set by
`capacitor.config.ts` → `ios.appendUserAgent: "FlowInspectIOS"`. If the marker is
missing, the server treats the request as web and the `/pricing` page becomes
reachable inside the app — which is what got flagged.

On the new build, confirm `/pricing` redirects to `/billing` inside the app. If
it renders the pricing page, the marker didn't apply and the build needs
rechecking before submission.

## For the App Review reply

- Give reviewers a demo account. Set `subscription_exempt = true` on it so they
  are never blocked mid-test — a reviewer hitting the paywall with no way past
  invites a second, unrelated rejection under Guideline 2.1.
- Note in the reply that the subscription is now sold via In-App Purchase, and
  that subscriptions previously purchased on the web are honored under
  Guideline 3.1.3(b).

## Not built (deliberately)

Migrating an IAP subscriber to Stripe to avoid Apple's ongoing cut. It only saves
~$10.35 per user one time, needs an email flow plus billing-anchor logic to avoid
double-charging, and adds churn risk. The cheaper lever is keeping signup on the
web so few users ever purchase through Apple at all.
