import crypto from "crypto";

const COOKIE_NAME = "pdf_tool_session";

function getSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET missing hai.");
  }

  return secret;
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function verifyLogin(login: string, password: string) {
  const allowedLogins =
    process.env.AUTH_ALLOWED_LOGINS?.split(",").map((item) =>
      item.trim().toLowerCase(),
    ) ?? [];

  const savedPassword = process.env.AUTH_PASSWORD;

  return (
    allowedLogins.includes(login.trim().toLowerCase()) &&
    Boolean(savedPassword) &&
    password === savedPassword
  );
}

export function createSessionToken(login: string) {
  const payload = Buffer.from(
    JSON.stringify({
      login,
      exp: Date.now() + 1000 * 60 * 60 * 8,
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  if (sign(payload) !== signature) return false;

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    exp: number;
  };

  return decoded.exp > Date.now();
}