import { redirect } from "next/navigation";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");
const devBypass = process.env.DEV_AUTH_BYPASS === "true";

export default function SignUpPage() {
  // In dev bypass mode, skip Clerk entirely
  if (devBypass || !isClerkConfigured) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <SignUp 
        afterSignInUrl="/dashboard"
        afterSignUpUrl="/onboarding"
        signInUrl="/login"
        appearance={{
          elements: {
            formButtonPrimary: "bg-primary hover:bg-primary/90",
          }
        }}
      />
      <p className="max-w-sm px-4 text-center text-xs text-muted-foreground">
        By creating an account you accept the{" "}
        <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>
        {" "}and the{" "}
        <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </div>
  );
}
