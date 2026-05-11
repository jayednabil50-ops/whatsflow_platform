import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Bell, Command, Search, ChevronDown } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";
import { isOwnerEmail } from "@/lib/platform/workspace";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = user.user_metadata?.full_name?.toString().trim() || "";
  const workspaceInitial = fullName.charAt(0) || user.email?.charAt(0) || "U";
  const workspaceLabel = fullName || user.email || "User";
  const showAdmin = isOwnerEmail(user.email);

  return (
    <div className="flex min-h-screen bg-background page-noise">
      <AppSidebar showAdmin={showAdmin} userEmail={user.email} />
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            {/* Left: brand (mobile) + search */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Link href={"/app" as never} className="font-bold text-sm tracking-tight lg:hidden text-foreground shrink-0">
                {BRAND}
              </Link>
              <div className="hidden sm:flex min-w-0 max-w-xs flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground hover:border-accent/30 transition-colors">
                <Search className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-xs">Search sessions, messages…</span>
                <span className="ml-auto hidden xl:inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] shrink-0">
                  <Command className="h-2.5 w-2.5" /> K
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/docs"
                className="focus-ring hidden rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground hover:border-accent/30 sm:inline-flex"
              >
                Docs
              </Link>

              {/* Dark/Light toggle */}
              <ThemeToggle />

              {/* Notifications */}
              <button
                className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:text-foreground hover:border-accent/30"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>

              {/* User avatar */}
              <button className="focus-ring flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 transition hover:border-accent/30">
                <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-emerald-400 to-cyan-400 text-[10px] font-bold text-black shrink-0">
                  {workspaceInitial.toUpperCase()}
                </div>
                <span className="hidden max-w-[100px] truncate text-xs font-medium sm:block text-foreground">
                  {workspaceLabel}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
