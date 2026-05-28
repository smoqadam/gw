"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchIndex } from "@/lib/lessons";
import type { IndexEntry } from "@/lib/types";
import { Nav } from "./Nav";
import { Drawer } from "./Drawer";
import { AboutModal } from "./AboutModal";

/** Shared top bar for every page: nav, the lessons drawer, and the About modal. */
export function SiteHeader() {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const activeId = useSearchParams().get("lesson");

  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch(() => setIndex([]));
  }, []);

  return (
    <>
      <Nav onMenu={() => setDrawerOpen(true)} onAbout={() => setAboutOpen(true)} />
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entries={index}
        activeId={activeId}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
