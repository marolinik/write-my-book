import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const PLANS = {
  founder: {
    name: "Founder",
    monthlyPrice: 19,
    annualPrice: null as number | null, // Monthly only
    maxBooks: Infinity,
    maxSlots: 200,
    trialDays: 0,
    features: [
      "Unlimited books",
      "All 14 agents & workflows",
      "Series management",
      "Advanced analytics",
      "Standard export",
      "Locked-in $19/mo forever",
    ],
    gatedFeatures: [] as string[], // Has all Pro features
    stripePriceIds: {
      monthly: process.env.STRIPE_FOUNDER_MONTHLY_PRICE_ID,
    } as { monthly?: string; annual?: string },
  },
  indie: {
    name: "Indie Author",
    monthlyPrice: 49,
    annualPrice: 490 as number | null,
    maxBooks: 2,
    maxSlots: null as number | null,
    trialDays: 14,
    features: [
      "2 active books",
      "All 14 agents & workflows",
      "Standard export",
    ],
    gatedFeatures: ["series", "analytics"],
    stripePriceIds: {
      monthly: process.env.STRIPE_INDIE_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_INDIE_ANNUAL_PRICE_ID,
    },
  },
  professional: {
    name: "Professional",
    monthlyPrice: 99,
    annualPrice: 990 as number | null,
    maxBooks: Infinity,
    maxSlots: null as number | null,
    trialDays: 14,
    features: [
      "Unlimited books",
      "All 14 agents & workflows",
      "Series management",
      "Advanced analytics",
      "Standard export",
    ],
    gatedFeatures: [] as string[],
    stripePriceIds: {
      monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
  },
  publisher: {
    name: "Publisher",
    monthlyPrice: 499,
    annualPrice: 4990 as number | null,
    maxBooks: Infinity,
    maxSlots: null as number | null,
    trialDays: 0,
    features: [
      "Unlimited books",
      "All 14 agents & workflows",
      "Series management",
      "Advanced analytics",
      "Priority support",
      "Multi-user seats (Coming Soon)",
      "API access (Coming Soon)",
      "White-label export (Coming Soon)",
    ],
    gatedFeatures: [] as string[],
    stripePriceIds: {
      monthly: process.env.STRIPE_PUBLISHER_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_PUBLISHER_ANNUAL_PRICE_ID,
    },
  },
};

export type PlanKey = keyof typeof PLANS;

/** Plans that exist in Stripe (excludes Enterprise "Contact Us") */
export const PURCHASABLE_PLANS: PlanKey[] = ["founder", "indie", "professional", "publisher"];
