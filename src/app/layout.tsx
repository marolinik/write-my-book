export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import {
  Libre_Franklin,
  Cormorant_Garamond,
  JetBrains_Mono,
  Lora,
} from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppToaster } from "@/components/ui/app-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/providers/query-provider";
import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";
import { ToastRouteGuard } from "@/components/providers/toast-route-guard";
import "./globals.css";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

const fontSans = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const fontSerif = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
});

const siteTitle = "WriteMyBook - AI-Powered Novel Writing Platform";
const siteDescription =
  "A professional publishing house in your browser. AI agents handle drafting, editing, and quality assurance while you maintain creative control.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://writemybook.app",
  ),
  title: {
    default: siteTitle,
    template: "%s | WriteMyBook",
  },
  description: siteDescription,
  keywords: [
    "AI writing",
    "novel writing software",
    "book writing platform",
    "AI editor",
    "manuscript editing",
    "BYOK AI",
    "book editing software",
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "WriteMyBook",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
};

// interactive-widget makes Chrome/Android shrink the layout viewport when
// the virtual keyboard opens, keeping the sticky toolbar and status bar
// visible while typing. iOS ignores it (mitigated via dvh heights and
// ProseMirror scrollMargin in the editor).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const inner = (
    <QueryProvider>
      <TooltipProvider>
        {children}
      </TooltipProvider>
      {/* D-139: top-center toasts on small screens (see app-toaster.tsx) so the
          bottom tab nav + soft keyboard can't occlude them; bottom-right on
          desktop is unchanged. */}
      <AppToaster />
      <ToastRouteGuard />
    </QueryProvider>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontSerif.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {isClerkConfigured ? (
            <ClerkThemeProvider>{inner}</ClerkThemeProvider>
          ) : (
            inner
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
