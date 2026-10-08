import { describe, expect, test } from "vitest";
import {
  PROD_SMTP_HOST,
  PROD_SMTP_USER,
  appEnvName,
  assertEmailTransportAllowed,
  isProdMailbox,
} from "../convex/lib/emailSafety";
import {
  PROD_CONVEX_URLS,
  evaluateDeploymentSafety,
} from "../scripts/check-convex-env.mjs";

/**
 * Deployment-safety guards:
 * 1. Email must never leave the sandbox through the production mailbox on a
 *    non-production deployment (convex/lib/emailSafety.ts, enforced in
 *    convex/emailSendAction.ts).
 * 2. A non-production build must never be pointed at the production Convex
 *    deployment (scripts/check-convex-env.mjs, runs before `next build`).
 */

const SANDBOX_HOST = "smtp.ethereal.email";
const SANDBOX_USER = "dev-sandbox@ethereal.email";

describe("appEnvName", () => {
  test("normalizes and defaults missing APP_ENV to non-production", () => {
    expect(appEnvName({ APP_ENV: " production " })).toBe("production");
    expect(appEnvName({ APP_ENV: "DEV" })).toBe("dev");
    expect(appEnvName({})).toBe("development");
    expect(appEnvName({ APP_ENV: "" })).toBe("development");
  });
});

describe("isProdMailbox", () => {
  test("matches the production mailbox case-insensitively", () => {
    expect(isProdMailbox(PROD_SMTP_HOST, PROD_SMTP_USER)).toBe(true);
    expect(isProdMailbox(PROD_SMTP_HOST.toUpperCase(), PROD_SMTP_USER)).toBe(
      true,
    );
    expect(isProdMailbox(SANDBOX_HOST, SANDBOX_USER)).toBe(false);
    expect(isProdMailbox(PROD_SMTP_HOST, SANDBOX_USER)).toBe(false);
  });
});

describe("assertEmailTransportAllowed", () => {
  test("allows sandbox SMTP on a non-production deployment", () => {
    expect(() =>
      assertEmailTransportAllowed({
        appEnv: "dev",
        host: SANDBOX_HOST,
        user: SANDBOX_USER,
      }),
    ).not.toThrow();
    // Missing APP_ENV is treated as non-production but sandbox is fine.
    expect(() =>
      assertEmailTransportAllowed({ host: SANDBOX_HOST, user: SANDBOX_USER }),
    ).not.toThrow();
  });

  test("allows the production mailbox only on the production deployment", () => {
    expect(() =>
      assertEmailTransportAllowed({
        appEnv: "production",
        host: PROD_SMTP_HOST,
        user: PROD_SMTP_USER,
      }),
    ).not.toThrow();
  });

  test("blocks production SMTP credentials on a non-production deployment", () => {
    for (const appEnv of ["dev", "staging", undefined, ""]) {
      expect(() =>
        assertEmailTransportAllowed({
          appEnv,
          host: PROD_SMTP_HOST,
          user: PROD_SMTP_USER,
        }),
      ).toThrow(/production SMTP credentials/);
    }
  });
});

describe("evaluateDeploymentSafety (build guard)", () => {
  test("allows any non-production Convex URL in any environment", () => {
    for (const vercelEnv of ["preview", "development", undefined, "local"]) {
      expect(
        evaluateDeploymentSafety({
          convexUrl: "https://helpful-bass-650.convex.cloud",
          vercelEnv,
        }),
      ).toEqual({ ok: true });
    }
  });

  test("allows the production URL only for production builds", () => {
    for (const prodUrl of PROD_CONVEX_URLS) {
      expect(
        evaluateDeploymentSafety({
          convexUrl: prodUrl,
          vercelEnv: "production",
        }),
      ).toEqual({ ok: true });
      for (const vercelEnv of ["preview", "development", undefined]) {
        const result = evaluateDeploymentSafety({
          convexUrl: prodUrl,
          vercelEnv,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/PRODUCTION Convex/);
      }
    }
  });

  test("tolerates a trailing slash and an unconfigured URL", () => {
    expect(
      evaluateDeploymentSafety({
        convexUrl: "https://helpful-bass-650.convex.cloud/",
        vercelEnv: "preview",
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateDeploymentSafety({ convexUrl: "", vercelEnv: "preview" }),
    ).toEqual({ ok: true });
    expect(evaluateDeploymentSafety({ vercelEnv: "preview" })).toEqual({
      ok: true,
    });
  });
});
