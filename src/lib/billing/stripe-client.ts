import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    maxBooks: 1,
    features: ["1 book", "BYOK only", "Basic export"],
  },
  starter: {
    name: "Starter",
    price: 9,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    maxBooks: 5,
    features: ["5 books", "BYOK only", "All exports", "Beta reader lab"],
  },
  pro: {
    name: "Pro",
    price: 29,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
    maxBooks: Infinity,
    features: [
      "Unlimited books",
      "BYOK only",
      "All exports",
      "Beta reader lab",
      "Series manager",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: 99,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    maxBooks: Infinity,
    features: [
      "Unlimited books",
      "BYOK only",
      "All exports",
      "Beta reader lab",
      "Series manager",
      "Team collaboration",
      "Dedicated support",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
