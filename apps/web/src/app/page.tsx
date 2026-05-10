import { redirect } from "next/navigation";

/**
 * Корневая страница — редирект на /folders. Middleware гарантирует наличие
 * сессии до этого момента. force-dynamic — чтобы не prerender'ить redirect.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  redirect("/folders");
}
