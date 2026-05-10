import { Suspense } from "react";
import { LoginForm } from "./login-form";

// useSearchParams требует Suspense boundary при build-time prerender.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
