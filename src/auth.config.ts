import type { NextAuthConfig } from "next-auth";

// The parts of the login setup that don't touch the database - shared by the
// full setup (src/auth.ts, which adds the email + password check) and the
// proxy, which only reads the session cookie. Keeping the database out of
// the proxy keeps that function small.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
        token.avatarColor = (user as { avatarColor: string }).avatarColor;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "HEAD" | "SALES_MANAGER" | "COORDINATOR";
        session.user.avatarColor = token.avatarColor as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
