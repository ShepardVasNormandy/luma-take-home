import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as argon2 from "argon2";

const EMAIL = "maya@example.com";
const PASSWORD = "correct-horse-battery-staple";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.OPERATOR_EMAIL = EMAIL;
  process.env.OPERATOR_PASSWORD_HASH = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  process.env.SESSION_SECRET = "test-session-secret-longer-than-32-chars";

  const { authPlugin } = await import("../src/auth/plugin.js");
  app = Fastify();
  await app.register(authPlugin);
  app.get("/guarded", { preHandler: app.requireOperator }, async () => ({ ok: true }));
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
});

function sessionCookie(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((c) => c.name === "session");
}

describe("auth", () => {
  it("login success sets a session cookie and grants access to a guarded route", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "  MAYA@Example.COM  ", password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ ok: true });

    const cookie = sessionCookie(login);
    expect(cookie).toBeDefined();
    expect(cookie!.value).not.toBe("");

    const guarded = await app.inject({
      method: "GET",
      url: "/guarded",
      cookies: { session: cookie!.value },
    });
    expect(guarded.statusCode).toBe(200);
    expect(guarded.json()).toEqual({ ok: true });
  });

  it("rejects a wrong password with 401 and sets no session", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: "not-the-password" },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json()).toEqual({ error: "Invalid credentials" });
    expect(sessionCookie(login)).toBeUndefined();
  });

  it("rejects a wrong email with 401", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "intruder@example.com", password: PASSWORD },
    });
    expect(login.statusCode).toBe(401);
  });

  it("returns 401 on the guarded route without a session", async () => {
    const guarded = await app.inject({ method: "GET", url: "/guarded" });
    expect(guarded.statusCode).toBe(401);
    expect(guarded.json()).toEqual({ error: "Unauthorized" });
  });

  it("logout revokes access", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    const cookie = sessionCookie(login)!;

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { session: cookie.value },
    });
    expect(logout.statusCode).toBe(200);

    const cleared = sessionCookie(logout);
    expect(cleared).toBeDefined();

    const guarded = await app.inject({
      method: "GET",
      url: "/guarded",
      cookies: { session: cleared!.value },
    });
    expect(guarded.statusCode).toBe(401);
  });
});
