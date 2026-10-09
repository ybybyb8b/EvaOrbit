"use client";

import { Children, isValidElement, useRef, type ReactElement, type SelectHTMLAttributes, type OptionHTMLAttributes } from "react";
import { usesCapsules } from "@/lib/choice-presentation";

/** A native select contract with capsules for short, flat, controlled choices. */
export function ChoiceSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null);
  const children = Children.toArray(props.children);
  const options = children.filter((child): child is ReactElement<OptionHTMLAttributes<HTMLOptionElement>> => isValidElement(child) && child.type === "option");
  if (props.multiple || props.size || props.value === undefined || options.length !== children.length || !usesCapsules(options.length)) return <select {...props} />;
  return <span className="choice-select">
    <span className="choice-capsules" role="group" aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} ref={element => {
      if (!element || props["aria-label"] || props["aria-labelledby"]) return;
      const label = element.closest("label,.field")?.querySelector(":scope > span");
      if (label && !label.contains(element)) element.setAttribute("aria-label", label.textContent ?? "");
    }}>
      {options.map(option => {
        const value = String(option.props.value ?? option.props.children ?? "");
        return <button type="button" data-form-change key={value} disabled={props.disabled || option.props.disabled} aria-label={typeof option.props.children === "string" ? option.props.children : undefined} aria-pressed={String(props.value) === value} onClick={() => {
          if (!select.current) return;
          select.current.value = value;
          select.current.dispatchEvent(new Event("change", { bubbles: true }));
        }}>{option.props.children}</button>;
      })}
    </span>
    <select {...props} ref={select} className="choice-select-native" tabIndex={-1} aria-hidden="true" onInvalid={event => {
      props.onInvalid?.(event);
      event.preventDefault();
      select.current?.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }} />
  </span>;
}
