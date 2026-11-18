import type { ReactNode } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import Brand from "@/components/brand";
import Icon from "@/components/icon";

const navigation = [
  { href: "/library", label: "My library", icon: "book" as const },
  { href: "/import", label: "Import questions", icon: "upload" as const },
  { href: "/history", label: "Study history", icon: "history" as const },
];

export default function WorkspaceShell({
  children,
  active,
  email,
}: {
  children: ReactNode;
  active?: (typeof navigation)[number]["href"];
  email: string;
}) {
  const initials = email
    .split("@")[0]
    .split(/[._-]/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2);

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand href="/library" />
        <span className="nav-caption">Workspace</span>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">{initials || "CS"}</span>
            <span className="user-email" title={email}>{email}</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="button quiet">
              <Icon name="logout" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <span className="topbar-mobile-brand"><Brand href="/library" /></span>
          <span className="topbar-label">A little progress adds up.</span>
          <Link className="button secondary" href="/import">
            <Icon name="plus" />
            New quiz
          </Link>
        </header>
        <main id="main-content" className="workspace-content">{children}</main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label.replace(" questions", "").replace(" study", "")}</span>
          </Link>
        ))}
        <form action={signOutAction}>
          <button type="submit" aria-label="Sign out">
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
        </form>
      </nav>
    </div>
  );
}
