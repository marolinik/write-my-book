import { redirect } from "next/navigation";
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
    <div className="flex min-h-screen items-center justify-center bg-background">
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
    </div>
  );
}
