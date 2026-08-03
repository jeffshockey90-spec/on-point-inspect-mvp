import { handleSubscriptionCheckout } from "../../../lib/subscriptionCheckout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleSubscriptionCheckout(req);
}
