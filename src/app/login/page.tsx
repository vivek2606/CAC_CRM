import { LoginForm } from "./login-form";
import { SakuragiMark } from "@/components/sakuragi-logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <SakuragiMark className="h-14 w-14 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">SAKURAGI CRM Pro</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your sales workspace</p>
        </div>
        <LoginForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </div>
  );
}
