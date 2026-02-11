export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import {
  Libre_Franklin,
  Cormorant_Garamond,
  JetBrains_Mono,
  Lora,
} from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/providers/query-provider";
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

export const metadata: Metadata = {
  title: "WriteMyBook - AI-Powered Novel Writing Platform",
  description:
    "A professional publishing house in your browser. AI agents handle drafting, editing, and quality assurance while you maintain creative control.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <html lang="en">
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontSerif.variable} font-sans antialiased`}
      >
        <QueryProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster richColors position="bottom-right" />
        </QueryProvider>
      </body>
    </html>
  );

  if (isClerkConfigured) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }

  return content;
}
