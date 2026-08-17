import { cookies } from "next/headers";
import { createSessionToken, sessionCookieName, verifySessionToken, type AppSession } from "@/lib/auth/session-token";

export type { AppSession } from "@/lib/auth/session-token";

export async function setSessionCookie(session: AppSession): Promise<void> {
  const token = await createSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  if (!token) return null;

  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
