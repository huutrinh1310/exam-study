import type { ReactNode } from "react";
import Brand from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-scene">
      <header className="auth-header"><Brand /></header>
      <main id="main-content" className="auth-main">
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">Clear answers. More confident exam days.</footer>
    </div>
  );
}
