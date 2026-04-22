import Stripe from "stripe";
import { env } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (!env.stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-08-27.basil"
    });
  }

  return stripeInstance;
};
