import type { ReactNode } from "react";
import { Icon } from "./icons";

export function TrackerPicture({ icon, size = 52, image }: { icon?: string; size?: number; image?: ReactNode }) {
  if (image) return <span className="tracker-picture has-image" style={{ width: size, height: size }}>{image}</span>;
  if (icon && icon !== "◉") return <span className="tracker-picture tracker-picture-legacy" style={{ width: size, height: size }} aria-hidden="true">{icon}</span>;
  return <span className="tracker-picture tracker-picture-default" style={{ width: size, height: size }} aria-hidden="true"><Icon name="tracker" /></span>;
}
