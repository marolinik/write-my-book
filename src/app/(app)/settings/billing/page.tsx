"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { formatTokens } from "@/lib/utils";
import { billingStatusNotice } from "@/lib/billing/status-notice";
import { useLocale } from "@/components/providers/language-provider";
import {
  Check,
  ExternalLink,
  BookOpen,
  Key,
  BrainCircuit,
  Layers,
  AlertTriangle,
  Crown,
  Sparkles,
  Building2,
  Info,
} from "lucide-react";
import {
  useSubscription,
  useCheckout,
  useManageBilling,
  useUsage,
  useFounderCount,
} from "@/hooks/use-billing";

// ─── Plan Card Data ──────────────────────────────────────────────
const PLAN_CARDS = [
  {
    key: "founder" as const,
    name: "Founder",
    icon: Crown,
    monthlyPrice: 19,
    annualPrice: null as number | null,
    badge: "Limited -- Founder's Price",
    highlight: true,
    features: [
      "Unlimited books",
      "All 14 agents & workflows",
      "Series management",
      "Advanced analytics",
      "Standard export",
      "Locked-in $19/mo forever",
    ],
  },
  {
    key: "indie" as const,
    name: "Indie Author",
    icon: Sparkles,
    monthlyPrice: 49,
    annualPrice: 490,
    badge: "14-day free trial",
    highlight: false,
    features: [
      "2 active books",
      "All 14 agents & workflows",
      "Standard export",
    ],
  },
  {
    key: "professional" as const,
    name: "Professional",
    icon: BookOpen,
    monthlyPrice: 99,
    annualPrice: 990,
    badge: "Most Popular",
    highlight: false,
    features: [
      "Unlimited books",
      "All 14 agents & workflows",
      "Series management",
      "Advanced analytics",
      "Standard export",
    ],
  },
  {
    key: "publisher" as const,
    name: "Publisher",
    icon: Building2,
    monthlyPrice: 499,
    annualPrice: 4990,
    badge: null,
    highlight: false,
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
  },
];

export default function BillingPage() {
  const locale = useLocale();
  const { data: subscription } = useSubscription();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: founderCount } = useFounderCount();
  const checkout = useCheckout();
  const manageBilling = useManageBilling();
  const [annualBilling, setAnnualBilling] = useState(false);

  const currentPlan = subscription?.plan ?? "none";
  const currentStatus = subscription?.status ?? "none";
  const stripeConfigured = subscription?.stripeConfigured !== false;
  const isTrialing = currentStatus === "trialing";
  const trialEnd = subscription?.trialEnd
    ? new Date(subscription.trialEnd)
    : null;
  const founderSoldOut = (founderCount?.available ?? 1) <= 0;

  // D-07: honest banners for degraded-but-live subscription states the API
  // already reports (past_due dunning, scheduled cancellation).
  const statusNotice = billingStatusNotice(subscription, locale);

  const handleCheckout = (planKey: string) => {
    checkout.mutate({
      plan: planKey,
      billingInterval: annualBilling ? "annual" : "monthly",
    });
  };

  const getDisplayPrice = (plan: (typeof PLAN_CARDS)[number]) => {
    if (!plan.annualPrice) return plan.monthlyPrice;
    if (annualBilling) return plan.annualPrice;
    return plan.monthlyPrice;
  };

  const getPriceLabel = (plan: (typeof PLAN_CARDS)[number]) => {
    if (!plan.annualPrice) return "/mo";
    if (annualBilling) return "/yr";
    return "/mo";
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Usage & Billing
      </h1>
      <p className="text-muted-foreground">
        Choose your plan and track your AI token usage
      </p>

      <Separator className="my-6" />

      {/* Stripe Warning */}
      {!stripeConfigured && (
        <Card className="mb-6 border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Stripe is not configured. Set STRIPE_SECRET_KEY in your
              environment to enable billing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trial Banner */}
      {isTrialing && trialEnd && (
        <Card className="mb-6 border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="flex items-center gap-3 py-4">
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">
                You&apos;re on a 14-day free trial of{" "}
                {subscription?.planName ?? currentPlan}
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Trial ends {trialEnd.toLocaleDateString(locale)}. Add a payment
                method to continue after your trial.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription status notice: past_due dunning / pending cancellation (D-07) */}
      {statusNotice && (
        <Card
          className={
            statusNotice.kind === "past_due"
              ? "mb-6 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
              : "mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          }
        >
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle
              className={
                statusNotice.kind === "past_due"
                  ? "h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                  : "h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              }
            />
            <div>
              <p
                className={
                  statusNotice.kind === "past_due"
                    ? "font-medium text-red-800 dark:text-red-200"
                    : "font-medium text-amber-800 dark:text-amber-200"
                }
              >
                {statusNotice.title}
              </p>
              <p
                className={
                  statusNotice.kind === "past_due"
                    ? "text-sm text-red-700 dark:text-red-300 mt-1"
                    : "text-sm text-amber-700 dark:text-amber-300 mt-1"
                }
              >
                {statusNotice.body}
              </p>
              {stripeConfigured && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => manageBilling.mutate()}
                  disabled={manageBilling.isPending}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Manage Subscription
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Annual Toggle */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <span
          className={`text-sm font-medium ${!annualBilling ? "text-foreground" : "text-muted-foreground"}`}
        >
          Monthly
        </span>
        <Switch
          checked={annualBilling}
          onCheckedChange={setAnnualBilling}
        />
        <span
          className={`text-sm font-medium ${annualBilling ? "text-foreground" : "text-muted-foreground"}`}
        >
          Annual
        </span>
        {annualBilling && (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
          >
            Save ~17%
          </Badge>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {PLAN_CARDS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const isFounder = plan.key === "founder";
          const disabled = isFounder && founderSoldOut && !isCurrent;

          return (
            <Card
              key={plan.key}
              className={`relative ${
                isCurrent
                  ? "border-primary ring-1 ring-primary"
                  : isFounder && !founderSoldOut
                    ? "border-amber-400 ring-1 ring-amber-400"
                    : ""
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-4">
                  <Badge
                    variant={
                      isFounder
                        ? "default"
                        : plan.key === "professional"
                          ? "default"
                          : "secondary"
                    }
                    className={
                      isFounder
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : ""
                    }
                  >
                    {isFounder && founderSoldOut ? "SOLD OUT" : plan.badge}
                  </Badge>
                </div>
              )}

              <CardHeader className="pt-6">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <plan.icon className="h-4 w-4" />
                    {plan.name}
                  </span>
                  {isCurrent && <Badge variant="default">Current</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    ${getDisplayPrice(plan)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {getPriceLabel(plan)}
                    </span>
                  </span>
                  {annualBilling && plan.annualPrice && (
                    <span className="block text-xs text-muted-foreground mt-1">
                      ${Math.round(plan.annualPrice / 12)}/mo equivalent
                    </span>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent>
                {/* Founder Counter */}
                {isFounder && founderCount && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {founderCount.claimed} of {founderCount.total} claimed
                      </span>
                      <span>{founderCount.available} left</span>
                    </div>
                    <Progress
                      value={
                        (founderCount.claimed / founderCount.total) * 100
                      }
                      className="h-2"
                    />
                  </div>
                )}

                {/* Features */}
                <ul className="space-y-2 text-sm mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                {isCurrent && stripeConfigured && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    size="sm"
                    onClick={() => manageBilling.mutate()}
                    disabled={manageBilling.isPending}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Manage Subscription
                  </Button>
                )}
                {!isCurrent && stripeConfigured && !disabled && (
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => handleCheckout(plan.key)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Upgrade"}
                  </Button>
                )}
                {disabled && (
                  <Button className="w-full" size="sm" disabled>
                    Sold Out
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Enterprise Contact */}
      <Card className="mb-8">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">Enterprise</p>
            <p className="text-sm text-muted-foreground">
              Need custom seats, API access, or white-label export? Let&apos;s
              talk.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="mailto:enterprise@writemybook.com">Contact Us</a>
          </Button>
        </CardContent>
      </Card>

      {/* BYOK Explainer */}
      <Card className="mb-8 border-muted">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">BYOK -- Bring Your Own Key</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your subscription covers the WriteMyBook platform. You bring your
              own AI API keys (Anthropic, OpenRouter, OpenAI, etc.) for LLM
              costs. This means you pay actual provider rates with zero
              markup.
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* ─── Usage Stats (preserved from previous version) ─── */}

      {/* Your Key Savings */}
      {!usageLoading && usage?.total && usage.total.costEstimate > 0 && (
        <Card className="mb-6 border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Your Key Savings
            </CardTitle>
            <CardDescription>
              By using your own API keys, you maintain full control over costs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-700 dark:text-green-400">
              ${usage.total.costEstimate.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Total spent using your own keys (last 30 days) &mdash;
              no platform markup applied
            </p>
            {usage.byKeySource &&
              (() => {
                const sources = Object.entries(usage.byKeySource) as [
                  string,
                  { costEstimate: number; sessions: number },
                ][];
                const userEntry = sources.find(([k]) => k === "user");
                const totalCost = usage.total.costEstimate;
                const userCost = userEntry ? userEntry[1].costEstimate : 0;
                const userPct =
                  totalCost > 0
                    ? Math.round((userCost / totalCost) * 100)
                    : 0;
                if (userPct === 100) {
                  return (
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                    >
                      100% Your Keys
                    </Badge>
                  );
                }
                return (
                  <Badge variant="secondary" className="mt-2">
                    {userPct}% Your Keys / {100 - userPct}% Platform
                  </Badge>
                );
              })()}
          </CardContent>
        </Card>
      )}

      {/* Cost Drift Warning */}
      {usage?.costDrift?.hasWarning && (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Cost estimates may be inaccurate
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Over the last {usage.costDrift.sessionsAnalyzed} sessions,
                estimated costs differed from actual costs by{" "}
                {usage.costDrift.driftPercentage}%. This may be due to model
                pricing changes or unusual session patterns.
              </p>
              {usage.priceDiscrepancies > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {usage.priceDiscrepancies} model pricing discrepancies
                  detected against provider rates.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      {/* Usage Stats */}
      <h2 className="text-xl font-semibold mb-4">Token Usage (30 days)</h2>

      {usageLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-24 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Cost Split: LLM vs Embedding */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-blue-500" />
                  LLM Agent Costs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  ${(usage?.llmCosts?.costEstimate ?? 0).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {usage?.llmCosts?.sessions ?? 0} agent session
                  {(usage?.llmCosts?.sessions ?? 0) !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-500" />
                  Vector Embedding Costs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  ${(usage?.embeddingCosts?.costEstimate ?? 0).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatTokens(usage?.embeddingCosts?.tokens ?? 0)} tokens
                  embedded
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {usage?.total?.sessions ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Input Tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {formatTokens(usage?.total?.tokensInput ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Output Tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {formatTokens(usage?.total?.tokensOutput ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Est. Cost</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  ${(usage?.total?.costEstimate ?? 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* By Agent */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Usage by Agent</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {!usage?.byAgent ||
              Object.keys(usage.byAgent).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No usage data yet. Start an agent to see usage here.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(usage.byAgent).map(
                    ([agent, data]: [string, any]) => (
                      <div
                        key={agent}
                        className={`flex items-center justify-between rounded-md border p-3 ${
                          agent === "embedding"
                            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                            : ""
                        }`}
                      >
                        <div>
                          <p className="font-medium capitalize flex items-center gap-2">
                            {agent.replace(/-/g, " ")}
                            {agent === "embedding" && (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-xs"
                              >
                                Embeddings
                              </Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {data.sessions} session
                            {data.sessions !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            ${data.costEstimate.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatTokens(data.tokensInput)} in /{" "}
                            {formatTokens(data.tokensOutput)} out
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Model */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Usage by Model</CardTitle>
            </CardHeader>
            <CardContent>
              {!usage?.byModel ||
              Object.keys(usage.byModel).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No data yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(usage.byModel).map(
                    ([model, data]: [string, any]) => (
                      <div
                        key={model}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <p className="font-medium">{model}</p>
                        <div className="text-right">
                          <p className="font-medium">
                            ${data.costEstimate.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatTokens(
                              data.tokensInput + data.tokensOutput
                            )}{" "}
                            total tokens
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Book */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Usage by Book</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {!usage?.byBook || usage.byBook.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No per-book usage data yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {usage.byBook.map(
                    (book: {
                      bookId: string;
                      bookName: string;
                      tokensInput: number;
                      tokensOutput: number;
                      costEstimate: number;
                      sessions: number;
                    }) => (
                      <div
                        key={book.bookId}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <a
                            href={`/books/${book.bookId}`}
                            className="font-medium hover:underline flex items-center gap-1.5"
                          >
                            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                            {book.bookName}
                          </a>
                          <p className="text-sm text-muted-foreground">
                            {book.sessions} session
                            {book.sessions !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            ${book.costEstimate.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatTokens(book.tokensInput)} in /{" "}
                            {formatTokens(book.tokensOutput)} out
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
