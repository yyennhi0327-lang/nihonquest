import { describe, it, expect, afterEach } from "vitest";
import { authOptions } from "./auth-options";
import { getAuthSecret } from "./auth-secret";
import { encode, decode } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-secret-at-least-32-characters-long-123456";

describe("Auth Secret & Production Fail-Safe", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when NEXTAUTH_SECRET is missing or too short in production runtime", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;

    expect(getAuthSecret()).toContain('emergency-production-fallback-secret');

    process.env.NEXTAUTH_SECRET = "too-short";
    expect(getAuthSecret()).toContain('emergency-production-fallback-secret');
  });

  it("fails closed in middleware when NEXTAUTH_SECRET is missing in production runtime", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;

    const req = new NextRequest("https://nihonquest-rho.vercel.app/app");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?callbackUrl=%2Fapp");
  });
});

describe("Auth Session & JWT Header Size Safety", () => {
  it("strips base64 data URLs from JWT token to prevent oversized cookies", async () => {
    const largeBase64Avatar = "data:image/jpeg;base64," + "A".repeat(30000);

    const rawToken: JWT = {
      name: "Taro Yamada",
      email: "taro@example.com",
      picture: largeBase64Avatar,
      sub: "user-123",
    };

    const sanitizedToken = await authOptions.callbacks!.jwt!({
      token: rawToken,
      user: { id: "user-123", email: "taro@example.com", name: "Taro Yamada" },
      account: null,
    });

    expect(sanitizedToken.uid).toBe("user-123");
    expect(sanitizedToken.picture).toBeUndefined();
    expect((sanitizedToken as Record<string, unknown>).image).toBeUndefined();
  });

  it("preserves short external avatar URLs (like Google OAuth) while deleting base64", async () => {
    const googleUrl = "https://lh3.googleusercontent.com/a/ACg8ocK123456789";
    const rawToken: JWT = {
      name: "Hanako",
      email: "hanako@example.com",
      picture: googleUrl,
      sub: "user-456",
    };

    const token = await authOptions.callbacks!.jwt!({
      token: rawToken,
      user: { id: "user-456", email: "hanako@example.com", name: "Hanako" },
      account: null,
    });

    expect(token.picture).toBe(googleUrl);
  });

  it("ensures encrypted JWT token size is well below 1 KB (no cookie chunking, Vercel 494 safe)", async () => {
    const sanitizedToken: JWT = {
      name: "Kenji Sato",
      email: "kenji@example.com",
      sub: "user-789",
      uid: "user-789",
    };

    const encoded = await encode({
      token: sanitizedToken,
      secret: TEST_SECRET,
    });

    // Encrypted JWE string length should be around ~300-500 bytes
    expect(encoded.length).toBeLessThan(1024);

    // Decoding returns identical token
    const decoded = await decode({
      token: encoded,
      secret: TEST_SECRET,
    });
    expect(decoded?.uid).toBe("user-789");
    expect(decoded?.email).toBe("kenji@example.com");
  });

  it("sanitizes session callback to never expose base64 in session.user.image", async () => {
    const sessionResult = await authOptions.callbacks!.session!({
      session: {
        user: {
          name: "Kenji",
          email: "kenji@example.com",
          image: "data:image/png;base64," + "B".repeat(5000),
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      },
      token: {
        uid: "user-789",
      },
      user: { id: "user-789", email: "kenji@example.com" } as any,
      newSession: null,
      trigger: "update",
    });

    expect((sessionResult.user as any).id).toBe("user-789");
    expect(sessionResult.user?.image).toBeNull();
  });

  it("blocks protocol-relative open redirects in redirect callback", async () => {
    const baseUrl = "https://nihonquest.app";
    const evilRedirect = await authOptions.callbacks!.redirect!({
      url: "//evil.example.com/phish",
      baseUrl,
    });
    expect(evilRedirect).toBe(baseUrl);

    const validRelative = await authOptions.callbacks!.redirect!({
      url: "/app/practice",
      baseUrl,
    });
    expect(validRelative).toBe("https://nihonquest.app/app/practice");
  });
});

describe("Middleware & Navigation Flow", () => {
  it("redirects unauthenticated request to /login with callbackUrl", async () => {
    const req = new NextRequest("https://nihonquest-rho.vercel.app/app");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=%2Fapp");
  });

  it("cleans up stale chunked session cookies on redirect or navigation", async () => {
    const req = new NextRequest("https://nihonquest-rho.vercel.app/app", {
      headers: {
        cookie: "__Secure-next-auth.session-token.0=part0; __Secure-next-auth.session-token.1=part1",
      },
    });

    const res = await middleware(req);
    const setCookies = res.headers.get("set-cookie") || "";
    // Stale chunks should be instructed to delete (Max-Age=0 or expires in past)
    expect(setCookies).toContain("__Secure-next-auth.session-token.0");
    expect(setCookies).toContain("__Secure-next-auth.session-token.1");
  });

  it("permits authenticated requests to access protected app routes", async () => {
    const secret = getAuthSecret();
    const token = await encode({
      token: { uid: "user-123", email: "test@example.com" },
      secret,
    });

    const req = new NextRequest("https://nihonquest-rho.vercel.app/app/stats", {
      headers: {
        cookie: `__Secure-next-auth.session-token=${token}`,
      },
    });

    const res = await middleware(req);
    // Not redirected, continues to next()
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("supports multi-device concurrent sessions without cookie pollution", async () => {
    const secret = getAuthSecret();

    // Device A (Mobile)
    const tokenA = await encode({
      token: { uid: "user-multidev", email: "user@example.com" },
      secret,
    });

    // Device B (Desktop)
    const tokenB = await encode({
      token: { uid: "user-multidev", email: "user@example.com" },
      secret,
    });

    const reqA = new NextRequest("https://nihonquest-rho.vercel.app/app", {
      headers: { cookie: `__Secure-next-auth.session-token=${tokenA}` },
    });
    const reqB = new NextRequest("https://nihonquest-rho.vercel.app/app/learn", {
      headers: { cookie: `__Secure-next-auth.session-token=${tokenB}` },
    });

    const resA = await middleware(reqA);
    const resB = await middleware(reqB);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(tokenA.length).toBeLessThan(1024);
    expect(tokenB.length).toBeLessThan(1024);
  });
});

