import { Link, useRouter } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthActions, useMe } from "@/lib/auth";

export function SiteHeader() {
  const { data: me, isLoading } = useMe();
  const { logout } = useAuthActions();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "Events" },
    ...(me ? [{ to: "/organizer/events", label: "Organize" }] : []),
    ...(me?.user.is_platform_admin ? [{ to: "/admin", label: "Admin" }] : []),
  ] as const;

  async function handleLogout() {
    await logout();
    await router.navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="gradient-brand flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-brand-foreground shadow-brand">
            V
          </span>
          <span className="font-display text-lg tracking-tight">Verdict</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isLoading ? null : me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                    {me.user.display_name?.slice(0, 1).toUpperCase() ?? "?"}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">{me.user.display_name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {me.user.email ?? me.user.display_name}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void router.navigate({ to: "/organizer/events" })}>
                  My events
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-border bg-background px-5 py-3 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
