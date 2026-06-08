"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

/**
 * Dismiss all toast notifications when the route changes.
 * Uses a ref to track the previous pathname so toasts are NOT
 * dismissed on initial mount — only on actual navigation.
 */
export function ToastRouteGuard() {
  const pathname = usePathname();
  const prevRef = useRef(pathname);

  useEffect(() => {
    if (prevRef.current !== pathname) {
      toast.dismiss();
      prevRef.current = pathname;
    }
  }, [pathname]);

  return null;
}
