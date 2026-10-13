"use client";

import { useState } from "react";
import { ChoiceSelect } from "./choice-select";
import { canonicalProjectModule, joinProjectModule, projectModuleCatalog, splitProjectModule } from "@/lib/project-display";

export function ProjectModuleSelect({ value, modules, onChange }: { value: string; modules: readonly (string | null)[]; onChange: (value: string) => void }) {
  const catalog = projectModuleCatalog([...modules, value]);
  const { module, category } = splitProjectModule(value);
  const entry = catalog.find(entry => entry.name.toLocaleLowerCase() === module.toLocaleLowerCase());
  const [adding, setAdding] = useState<"module" | "category" | null>(null);
  const [name, setName] = useState("");
  function add() {
    if (!name.trim() || name.includes("/")) return;
    onChange(canonicalProjectModule(adding === "module" ? name : joinProjectModule(module, name), modules));
    setAdding(null);
    setName("");
  }
  return <div className="project-module-picker">
    <label className="field"><span>Module <small>Optional</small></span><ChoiceSelect aria-label="Module" value={entry?.name ?? ""} onChange={event => { onChange(event.target.value); setAdding(null); }}><option value="">No module</option>{catalog.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</ChoiceSelect></label>
    {module && <label className="field"><span>Category <small>Optional</small></span><ChoiceSelect aria-label="Module category" value={entry?.categories.find(name => name.toLocaleLowerCase() === category.toLocaleLowerCase()) ?? ""} onChange={event => onChange(joinProjectModule(module, event.target.value))}><option value="">Module only</option>{entry?.categories.map(category => <option key={category} value={category}>{category}</option>)}</ChoiceSelect></label>}
    <div className="project-module-actions"><button type="button" className="text-button" onClick={() => { setAdding("module"); setName(""); }}>New module</button>{module && <button type="button" className="text-button" onClick={() => { setAdding("category"); setName(""); }}>New category</button>}</div>
    {adding && <div className="project-module-new"><label className="field"><span>{adding === "module" ? "New module name" : "New category name"}</span><input autoFocus value={name} maxLength={adding === "module" ? 120 : Math.max(0, 117 - module.length)} pattern="[^/]+" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /></label><button type="button" className="button secondary" disabled={!name.trim() || name.includes("/")} onClick={add}>Use name</button><button type="button" className="text-button" onClick={() => setAdding(null)}>Cancel</button><small className="field-note">Use name to select it; saving this Item adds it to the project directory.</small></div>}
  </div>;
}
