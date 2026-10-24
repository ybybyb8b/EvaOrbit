"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLocale } from "@/components/locale-controller";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "@/lib/avatar";
import { subscriptionBrand } from "@/lib/subscription-preview";
import type { ApiError } from "@/lib/types";
import { useIconColors } from "./preview/use-icon-colors";
import styles from "./subscription-icon-field.module.css";

export async function saveIconSelection(id: number, file: File | null, remove = false) {
  if (!file && !remove) return;
  const body = new FormData();
  if (file) body.set("file", file);
  const response = await fetch(`/api/subscriptions/${id}/icon`, { method: file ? "POST" : "DELETE", ...(file ? { body } : {}) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ApiError | null;
    throw new Error(error?.error ?? "Icon could not be saved.");
  }
}

export function SubscriptionIconField({ name, source, file, remove = false, disabled = false, onChange, label }: {
  label?: string; name: string; source?: string | null; file: File | null; remove?: boolean; disabled?: boolean;
  onChange: (file: File | null, remove: boolean) => void;
}) {
  const { english } = useLocale();
  const preview = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const image = file ? preview : remove ? "" : source ?? "";
  const sources = useMemo(() => Object.fromEntries(image ? [[0, image]] : []), [image]);
  const { colors, transparent, neutralFilter } = useIconColors(sources);
  const brand = subscriptionBrand(name);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selected) return;
    setError("");
    if (selected.size <= 0 || selected.size > MAX_AVATAR_BYTES) { setError(english ? "Choose an image up to 4 MB." : "请选择不超过 4 MB 的图片。"); return; }
    try {
      if (!detectAvatarImage(new Uint8Array(await selected.arrayBuffer()))) throw new Error();
      const bitmap = await createImageBitmap(selected);
      bitmap.close();
      onChange(selected, false);
    } catch { setError(english ? "Choose a valid JPG, PNG or WebP image." : "请选择有效的 JPG、PNG 或 WebP 图片。"); }
  }
  return <div className="field wide">
    <span>{label ?? (english ? "Subscription icon" : "订阅图标")}</span>
    <div className={styles.content}>
      <span className={styles.preview} data-transparent={image ? transparent[0] : Boolean(brand)} aria-hidden="true">
        {/* Small local image is also sampled by the existing icon-color hook. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" style={transparent[0] && colors[0] === null ? { filter: neutralFilter } : undefined} /> : brand ? <span className={styles.brand} style={{ maskImage: `url("${brand.icon}")`, WebkitMaskImage: `url("${brand.icon}")`, background: ["#000000", "#181717"].includes(brand.color) ? "currentColor" : brand.color }} /> : <b>{name.trim().slice(0,1) || "S"}</b>}
      </span>
      <div className={styles.copy}>
        <div className={styles.actions}>
          <label className={`button secondary ${styles.upload}`}>
            {english ? (image ? "Replace icon" : "Upload icon") : (image ? "更换图标" : "上传图标")}
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label ?? (english ? "Choose subscription icon" : "选择订阅图标")} disabled={disabled} onChange={event => void choose(event)} />
          </label>
          {(file || (source && !remove)) && <button className="text-button" type="button" disabled={disabled} onClick={() => { onChange(null, Boolean(source)); setError(""); }}>{english ? "Use default" : "恢复默认"}</button>}
        </div>
        <small>{english ? "JPG, PNG, WebP · up to 4 MB" : "JPG、PNG、WebP · 最大 4 MB"}</small>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
