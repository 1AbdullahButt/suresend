// The 404 page. Next's default has no disclaimer, and every screen needs one (SPEC §18).
import type { Metadata } from "next";
import Link from "next/link";
import s from "./how-it-works/page.module.css";

export const metadata: Metadata = { title: "Page not found · SureSend" };

export default function NotFound() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" className={s.back}>
          ← Back to the demo
        </Link>
      </header>
      <main className={s.doc}>
        <h1>Page not found</h1>
        <p>There&apos;s nothing at this address.</p>
      </main>
      <footer className={s.footer}>Independent concept for Slite Agent · synthetic data · not affiliated with Slite</footer>
    </div>
  );
}
