/**
 * Onboarding route group layout.
 * Full-screen centered card without app chrome (no sidebar, header, or agent panel).
 * QueryProvider and Toaster are inherited from the root layout.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
