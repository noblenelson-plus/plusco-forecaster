// components/_shared/section-scroll-nav.tsx
"use client";

/**
 * Right-edge section navigator, styled as a vertical timeline: one dot per
 * section, joined by a thin line. Auto-discovers every element marked with
 * `data-scroll-section` (and an optional `data-scroll-label`) inside the page's
 * <main>, tracks the section in view as you scroll (its dot fills purple and
 * grows), and smooth-scrolls to a section on click — offsetting the sticky
 * page header so the section lands just below it.
 *
 * It re-scans as the DOM changes (tab switches, async data loads) via a
 * MutationObserver, and hides itself when fewer than two sections exist. Render
 * it OUTSIDE <main> so its own DOM never feeds back into the observer.
 */

import { useEffect, useRef, useState } from "react";

interface Section {
  id: string;
  label: string;
}

/** Breathing room between the sticky header and the scrolled-to section.
 *  Zero lands the section flush under the header; nudge negative to tuck it
 *  slightly higher. */
const HEADER_GAP = 0;

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

/** Current sticky-header height + the gap, in px. */
function headerOffset(): number {
  const header = document.querySelector("header");
  return (header?.getBoundingClientRect().height ?? 0) + HEADER_GAP;
}

export default function SectionScrollNav() {
  const [sections, setSections] = useState<Section[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Signature of the current section set, so recharts/tooltip mutations that
  // don't change the sections don't churn the observer.
  const sigRef = useRef<string>("");

  // Discover sections and keep in sync with DOM changes.
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    let raf = 0;
    // Set each section's scroll-margin-top so native scrolling (and our click
    // handler's scrollIntoView) always clears the sticky header — symmetric
    // whether we scroll up or down to the section.
    const applyMargins = (els: HTMLElement[]) => {
      const offset = headerOffset();
      els.forEach((el) => {
        el.style.scrollMarginTop = `${offset}px`;
      });
    };
    const scan = () => {
      const els = Array.from(
        main.querySelectorAll<HTMLElement>("[data-scroll-section]")
      );
      els.forEach((el, i) => {
        if (!el.id) el.id = `sec-${i}-${slug(el.dataset.scrollLabel ?? "")}`;
      });
      applyMargins(els);
      const next = els.map((el) => ({
        id: el.id,
        label: el.dataset.scrollLabel ?? el.id,
      }));
      const sig = next.map((s) => `${s.id}:${s.label}`).join("|");
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setSections(next);
      }
    };

    scan();
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    // Attributes aren't observed, so assigning `id`/`style` above never
    // re-triggers this.
    mo.observe(main, { childList: true, subtree: true });

    // The header's height changes with the tab (Type band, focus chip…), so
    // keep every section's scroll-margin in step with it.
    const header = document.querySelector("header");
    const ro = new ResizeObserver(() => {
      applyMargins(
        Array.from(main.querySelectorAll<HTMLElement>("[data-scroll-section]"))
      );
    });
    if (header) ro.observe(header);

    return () => {
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Track the section in view.
  useEffect(() => {
    if (sections.length === 0) return;
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId((visible[0].target as HTMLElement).id);
      },
      // Bias the "active" band to just under the header (upper quarter), so the
      // highlighted dot tracks the section you're actually reading.
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Refresh the margin for the header's current height, then let the browser
    // align the section top just below the header — same result up or down.
    el.style.scrollMarginTop = `${headerOffset()}px`;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Section navigation"
      className="fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
    >
      <div className="relative flex flex-col items-center gap-4 py-1">
        {/* Timeline spine — sits behind the dots. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-gray-200"
        />
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              title={s.label}
              aria-label={`Scroll to ${s.label}`}
              aria-current={active ? "true" : undefined}
              className="group relative flex items-center"
            >
              <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap bg-purple-600 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                {s.label}
              </span>
              <span
                className={`relative z-10 block rounded-full border transition-all duration-300 ${
                  active
                    ? "h-3 w-3 border-purple-600 bg-purple-600 ring-2 ring-purple-200"
                    : "h-2 w-2 border-gray-300 bg-white group-hover:border-purple-400"
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
