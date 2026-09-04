"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GridIcon, LogoMark, LogoutIcon } from "@/components/icons";

export function Sidebar({ email }: { email: string }) {
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-16 flex-col items-center gap-8 border-r border-hairline bg-cream-light py-6">
      <Link href="/dashboard" aria-label="Cofoundry" className="text-accent">
        <LogoMark className="h-7 w-7" />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-4">
        <Link
          href="/dashboard"
          aria-label="Projektübersicht"
          className="rounded-lg p-2 text-ink transition hover:bg-accent-soft hover:text-accent-strong"
        >
          <GridIcon className="h-5 w-5" />
        </Link>
      </nav>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/settings"
          aria-label="Account-Einstellungen"
          title={email}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong"
        >
          {email.slice(0, 1).toUpperCase()}
        </Link>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Abmelden"
          className="rounded-lg p-2 text-muted transition hover:bg-accent-soft hover:text-accent-strong"
        >
          <LogoutIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
