import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * Onboarding page.
 * Server component: redirects to /dashboard if user already completed onboarding.
 * Otherwise renders the client-side OnboardingWizard.
 */
export default async function OnboardingPage() {
  const user = await requireUser();

  if (user.onboardingComplete) {
    // Complete users NEVER server-redirect here — the middleware gate can
    // bounce them back if the browser's wmb_onboarded cookie is absent (the
    // ERR_TOO_MANY_REDIRECTS loop hit by the live upgrade tester). Render a
    // static "already done" view with a plain Link instead.
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4">
        <h1 className="font-display text-2xl font-semibold">Onboarding complete</h1>
        <p className="text-muted-foreground">
          Your account is set up. Open your workspace below.
        </p>
        <Link href="/dashboard" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Open Dashboard
        </Link>
      </div>
    );
  }

  return <OnboardingWizard />;
}
