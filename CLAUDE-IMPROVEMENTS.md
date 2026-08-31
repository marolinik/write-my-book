# Landing Page & Auth Fixes Proposal

## 1. Landing Page Improvements

### Current Issues:
- Hero section could be more compelling
- Missing social proof/testimonials
- No demo/sandbox mode
- Mobile experience could be better

### Proposed Improvements:

#### A. Enhanced Hero Section (`src/components/landing/improved-hero.tsx`)
✅ Created - features:
- Social proof badge ("2,500+ writers trust WriteMyBook")
- Stronger value proposition with gradient text
- Clearer benefits (BYOK, No Token Markup, 14-Day Trial)
- Dual CTAs (Start Writing + See Demo)
- Trust indicators (No credit card, Setup in 2 min)

#### B. Add Social Proof Section
```tsx
// Add after Hero section
<section className="border-t bg-muted/30 py-16">
  <div className="container mx-auto px-4 text-center">
    <p className="text-sm text-muted-foreground mb-8">TRUSTED BY WRITERS FROM</p>
    <div className="flex flex-wrap justify-center gap-8 opacity-60">
      {/* Add publisher logos or writer avatars */}
    </div>
  </div>
</section>
```

#### C. Add Testimonials/Case Studies
```tsx
// Add before CTA section
<section className="py-20">
  <div className="container mx-auto px-4">
    <h2 className="text-3xl font-bold text-center mb-12">Writers Are Publishing With AI</h2>
    <div className="grid md:grid-cols-3 gap-8">
      {/* Testimonial cards */}
    </div>
  </div>
</section>
```

#### D. Add Interactive Demo Button
- Link to `/demo` or `/sandbox` route
- Pre-filled with sample manuscript
- Shows AI agents in action without sign-up

---

## 2. Logging Issues & Fixes

### Current Issues Found:
1. **`console.error` in webhook route** (`src/app/api/auth/webhook/route.ts` lines 23, 42, 100)
2. **Sentry `disableLogger: true`** in `next.config.ts` line 23 - hiding client errors
3. **No structured logging utility** - inconsistent log formatting

### Proposed Fixes:

#### A. Create Structured Logger (`src/lib/logger.ts`)
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  bookId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDev = process.env.NODE_ENV !== 'production';
  private sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  debug(message: string, context?: LogContext) {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  info(message: string, context?: LogContext) {
    console.info(`[INFO] ${message}`, context);
  }

  warn(message: string, context?: LogContext) {
    console.warn(`[WARN] ${message}`, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    console.error(`[ERROR] ${message}`, { error, ...context });
    
    // Send to Sentry in production
    if (this.sentryEnabled && process.env.NODE_ENV === 'production') {
      // Sentry.captureException(error instanceof Error ? error : new Error(message));
    }
  }
}

export const logger = new Logger();
```

#### B. Fix Sentry Config (`next.config.ts`)
```typescript
// Remove or set to false - disableLogger hides client errors
disableLogger: false,  // Was: true
```

#### C. Replace Console Statements
- Replace all `console.error/warn/log` with `logger.error/warn/info`
- Focus on critical paths: webhook, auth, API routes

---

## 3. Sign-Up Issues & Fixes

### Current Issues Found:
1. **Clerk webhook not creating user** - Webhook route exists but needs verification
2. **No redirect after sign-up** - Missing `afterSignInUrl` / `afterSignUpUrl`
3. **Dev bypass might interfere** - `DEV_AUTH_BYPASS=true` skips Clerk entirely

### Proposed Fixes:

#### A. Fix Clerk SignUp Component (`src/app/(auth)/signup/[[...sign-up]]/page.tsx`)
```tsx
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured = clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");
const devBypass = process.env.DEV_AUTH_BYPASS === "true";

export default function SignUpPage() {
  if (devBypass || !isClerkConfigured) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp 
        afterSignInUrl="/dashboard"
        afterSignUpUrl="/onboarding"  // Redirect to onboarding after sign-up
        signInUrl="/login"
      />
    </div>
  );
}
```

#### B. Verify Webhook Configuration
1. **Check Clerk Dashboard**:
   - Webhook URL: `https://yourdomain.com/api/auth/webhook`
   - Events: `user.created`, `user.updated`, `user.deleted`
   
2. **Verify Webhook Secret**:
   ```bash
   # Check .env.local
   CLERK_WEBHOOK_SECRET=whsec_...
   ```

3. **Test Webhook**:
   ```bash
   # Use Clerk CLI or dashboard to test
   npx @clerk/testing test-webhook
   ```

#### C. Add Missing Auth Routes if Needed
```tsx
// src/app/api/auth/[...clerk]/route.ts
// This file is needed for Clerk API routes
export { GET, POST } from "@clerk/nextjs/server";
```

#### D. Fix Dev Bypass Logic
```typescript
// In middleware.ts - clarify dev bypass behavior
const DEV_AUTH_BYPASS = 
  !isProduction && 
  process.env["DEV_AUTH_BYPASS"] === "true" &&
  process.env.DEV_CLERK_ID;  // Ensure dev user exists
```

---

## Implementation Priority:

1. **HIGH**: Fix sign-up flow (users can't sign up)
2. **HIGH**: Fix logging (errors are hidden)
3. **MEDIUM**: Improve landing page (conversion optimization)

## Next Steps:

Which would you like me to implement first?
1. Fix sign-up issues (Clerk config, webhook, redirect)
2. Fix logging (structured logger, Sentry config)
3. Implement landing page improvements
