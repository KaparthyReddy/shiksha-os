export const API_URL = process.env.API_URL ?? "http://localhost:4000";

export const ACCESS_COOKIE = "shiksha_at";
export const REFRESH_COOKIE = "shiksha_rt";
export const ACCESS_MAX_AGE = 15 * 60;
export const REFRESH_MAX_AGE = 7 * 24 * 3600;

/** Cookies are httpOnly, so page scripts can never read a token. Set COOKIE_SECURE=false to serve over plain http in production. */
export const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
};
