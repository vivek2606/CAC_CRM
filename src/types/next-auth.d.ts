import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "HEAD" | "SALES_MANAGER";
      avatarColor: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "HEAD" | "SALES_MANAGER";
    avatarColor: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "HEAD" | "SALES_MANAGER";
    avatarColor: string;
  }
}
