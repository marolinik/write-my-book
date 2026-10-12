import { describe, it, expect } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

/**
 * The middleware protects every route not in PUBLIC_ROUTE_PATTERNS. Crawlers,
 * link unfurlers and logged-out visitors must reach the demo and the metadata
 * routes Next.js generates from src/app (robots, sitemap, OG/Twitter images)
 * without being sent to sign-in.
 */
const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);
const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("middleware public routes", () => {
  it.each([
    "/",
    "/demo",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
    "/opengraph-image-abc123",
    "/twitter-image",
    "/twitter-image-abc123",
    "/privacy",
    "/terms",
    "/login",
    "/share/tok",
  ])("%s is public", (path) => {
    expect(isPublicRoute(req(path))).toBe(true);
  });

  it.each(["/dashboard", "/projects/abc", "/api/projects", "/settings", "/demo-admin"])(
    "%s is protected",
    (path) => {
      expect(isPublicRoute(req(path))).toBe(false);
    }
  );
});
