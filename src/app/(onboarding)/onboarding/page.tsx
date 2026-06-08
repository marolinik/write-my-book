import { redirect } from "next/navigation";
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
    redirect("/dashboard");
  }

  return <OnboardingWizard />;
}
