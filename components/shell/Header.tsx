"use client";
import { forwardRef } from "react";
import { cx, Mark, ui } from "@/components/ui/atoms";
import s from "./shell.module.css";

/** Design v2 header: the mark and name, Demo menu and Guided tour. Nothing else; the footer carries the concept tag (D-047). */
export const Header = forwardRef<
  HTMLButtonElement,
  { menuOpen: boolean; onMenu: () => void; onTour: () => void; tourOpen: boolean; children?: React.ReactNode }
>(function Header({ menuOpen, onMenu, onTour, tourOpen, children }, tourRef) {
  return (
    <header className={s.header}>
      <div className={s.brand}>
        <Mark />
        <span className={s.name}>SureSend</span>
      </div>
      <div className={s.headBtns}>
        <button
          type="button"
          className={cx(ui.btn, ui.outline, ui.sm, s.menuBtn)}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={onMenu}
          data-demo-menu-trigger=""
          data-tour="demo-menu"
        >
          <span className={s.menuLong}>Demo menu</span>
          <span className={s.menuShort}>
            Demo<span className="sr-only"> menu</span>
          </span>
        </button>
        <button
          ref={tourRef}
          type="button"
          className={cx(ui.btn, ui.primary, ui.sm, s.tourBtn)}
          aria-expanded={tourOpen}
          onClick={onTour}
          // Focus lands here after "Not now": a held Enter's repeat isn't a request for the tour.
          onKeyDown={(e) => {
            if (e.repeat) e.preventDefault();
          }}
          data-tour="tour-button"
        >
          Guided tour
        </button>
        {children}
      </div>
    </header>
  );
});
