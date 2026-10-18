"use client";

import { usePathname } from "next/navigation";
import { PageBackButton } from "./page-back-button";
import { PageHeading } from "./page-heading";

export function PageHeader(props: React.ComponentProps<typeof PageHeading>) {
  const pathname = usePathname();
  return <>{pathname.startsWith("/lucius/") && <header className="lucius-page-navigation"><PageBackButton /></header>}<PageHeading {...props} /></>;
}
