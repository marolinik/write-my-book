import { getUIStrings } from "@/lib/i18n/ui-strings";
import { requireUser } from "@/lib/auth";
import { ONBOARDING_RESUME_PATH } from "@/lib/onboarding-cookie";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * Onboarding page.
 * Server component: a writer who already completed onboarding gets an
 * "already done" view with a way into the app. Otherwise renders the
 * client-side OnboardingWizard.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const t = getUIStrings(user.preferredLanguage ?? "en");

  if (user.onboardingComplete) {
    // Complete users NEVER server-redirect here — the middleware gate can
    // bounce them back if the browser's wmb_onboarded cookie is absent (the
    // ERR_TOO_MANY_REDIRECTS loop hit by the live upgrade tester). Render a
    // static "already done" view instead. Its link goes through the route
    // that restores the cookie: a link straight to /dashboard hits the same
    // gate and lands back here, forever (UAT P5-S09). A plain <a>, not a
    // <Link>: the target is a route handler, and a prefetch must not run it.
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4">
        <h1 className="font-display text-2xl font-semibold">{t.appUI.onboardingComplete}</h1>
        <p className="text-muted-foreground">{t.onboardingUI.accountReady}</p>
        <a href={ONBOARDING_RESUME_PATH} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          {t.onboardingUI.openDashboard}
        </a>
      </div>
    );
  }

  return <OnboardingWizard />;
}
