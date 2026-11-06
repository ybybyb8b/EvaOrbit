"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "./icons";

/** Keep title/description/trailing non-interactive; leading is a separate control. */
export function Disclosure({ title, description, leading, trailing, children, className = "", defaultOpen = false, open, onOpenChange, id: providedId }: {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;
  function setExpanded(next: boolean) {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }
  const id = useId();
  return <section id={providedId} className={`eo-disclosure ${className}`} data-expanded={expanded} onInvalidCapture={event => {
    if (expanded) return;
    event.preventDefault();
    const field = event.target;
    setExpanded(true);
    requestAnimationFrame(() => {
      if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) && field.isConnected) {
        field.focus(); field.reportValidity();
      }
    });
  }}>
    <div className="eo-disclosure-header">
      {leading && <div className="eo-disclosure-leading">{leading}</div>}
      <button type="button" id={`${id}-trigger`} className="eo-disclosure-trigger" aria-expanded={expanded} aria-controls={`${id}-content`} onClick={() => setExpanded(!expanded)}>
        <span className="eo-disclosure-copy"><span className="eo-disclosure-title">{title}</span>{description && <span className="eo-disclosure-description">{description}</span>}</span>
        {trailing !== undefined && trailing !== null && <span className="eo-disclosure-trailing">{trailing}</span>}
        <Icon name="chevronDown" />
      </button>
    </div>
    <div id={`${id}-content`} className="eo-disclosure-content" aria-labelledby={`${id}-trigger`} aria-hidden={!expanded} inert={!expanded}>
      <div className="eo-disclosure-clip"><div className="eo-disclosure-body">{children}</div></div>
    </div>
  </section>;
}
