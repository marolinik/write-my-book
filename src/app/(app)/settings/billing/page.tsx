"use client";

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
import { formatTokens } from "@/lib/utils";
import { Check, ExternalLink, BookOpen } from "lucide-react";
import {
  useSubscription,
  useCheckout,
  useManageBilling,
  useUsage,
} from "@/hooks/use-billing";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    features: ["1 book", "BYOK only", "Basic export"],
  },
  {
    key: "starter",
    name: "Starter",
    price: 9,
    features: ["5 books", "BYOK only", "All exports", "Beta reader lab"],
  },
  {
    key: "pro",
    name: "Pro",
    price: 29,
    features: [
      "Unlimited books",
      "BYOK only",
      "All exports",
      "Beta reader lab",
      "Series manager",
      "Priority support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: 99,
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
];

export default function BillingPage() {
  const { data: subscription } = useSubscription();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const checkout = useCheckout();
  const manageBilling = useManageBilling();

  const currentPlan = subscription?.plan ?? "free";
  const stripeConfigured = subscription?.stripeConfigured !== false;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Usage & Billing
      </h1>
      <p className="text-muted-foreground">
        Track your AI token usage and manage your subscription
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

      {/* Plans */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {PLANS.map((plan) => (
          <Card
            key={plan.key}
            className={
              currentPlan === plan.key
                ? "border-primary ring-1 ring-primary"
                : ""
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {plan.name}
                {currentPlan === plan.key && (
                  <Badge variant="default">Current</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {plan.price === 0 ? (
                  "Free forever"
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    ${plan.price}
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.key !== "free" &&
                plan.key !== currentPlan &&
                stripeConfigured && (
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => checkout.mutate(plan.key)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Loading..." : "Upgrade"}
                  </Button>
                )}
              {plan.key !== "free" &&
                plan.key === currentPlan &&
                stripeConfigured && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    size="sm"
                    onClick={() => manageBilling.mutate()}
                    disabled={manageBilling.isPending}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Manage
                  </Button>
                )}
            </CardContent>
          </Card>
        ))}
      </div>

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
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <p className="font-medium capitalize">
                            {agent.replace(/-/g, " ")}
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
