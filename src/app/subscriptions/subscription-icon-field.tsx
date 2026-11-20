"use client";
import type {BusinessRequest} from "@/lib/business-request";
import {useFormPreview} from "@/components/form-preview";

import { ImageUploadField, useImageFilePreview } from "@/components/image-upload-field";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "@/lib/avatar";
import { subscriptionBrand } from "@/lib/subscription-preview";
import type { ApiError } from "@/lib/types";
import { useIconColors } from "./preview/use-icon-colors";
import styles from "./subscription-icon-field.module.css";

export async function saveIconSelection(id: number, file: File | null, remove = false, request:BusinessRequest=fetch) {
  if (!file && !remove) return;
  const body = new FormData();
  if (file) body.set("file", file);
  const response = await request(`/api/subscriptions/${id}/icon`, { method: file ? "POST" : "DELETE", ...(file ? { body } : {}) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ApiError | null;
    throw new Error(error?.error ?? "Icon could not be saved.");
  }
}

export function SubscriptionIconField({ name, source, file, remove = false, disabled = false, onChange, label }: {
  label?: string; name: string; source?: string | null; file: File | null; remove?: boolean; disabled?: boolean;
  onChange: (file: File | null, remove: boolean) => void;
}) {
  const { english } = useLocale();const previewOnly=useFormPreview();
  const preview = useImageFilePreview(file);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const image = preview ?? (remove ? "" : source ?? "");
  const sources = useMemo(() => Object.fromEntries(image ? [[0, image]] : []), [image]);
  const { colors, transparent, neutralFilter } = useIconColors(sources);
  const brand = subscriptionBrand(name);
  async function choose(selected: File) {
    if (disabled || previewOnly || checking) return;
    setError("");
    setChecking(true);
    try {
      if (!detectAvatarImage(new Uint8Array(await selected.arrayBuffer()))) throw new Error();
      const bitmap = await createImageBitmap(selected);
      bitmap.close();
      onChange(selected, false);
    } catch { setError(english ? "Choose a valid JPG, PNG or WebP image." : "请选择有效的 JPG、PNG 或 WebP 图片。"); }
    finally { setChecking(false); }
  }
  return <ImageUploadField className="field wide" title={label ?? (english ? "Subscription icon" : "订阅图标")}
    inputLabel={label ?? (english ? "Choose subscription icon" : "选择订阅图标")}
    thumbnail={<span className={styles.preview} data-transparent={image ? transparent[0] : Boolean(brand)}>
        {/* Small local image is also sampled by the existing icon-color hook. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" style={transparent[0] && colors[0] === null ? { filter: neutralFilter } : undefined} /> : brand ? <span className={styles.brand} style={{ maskImage: `url("${brand.icon}")`, WebkitMaskImage: `url("${brand.icon}")`, background: ["#000000", "#181717"].includes(brand.color) ? "currentColor" : brand.color }} /> : <b>{name.trim().slice(0,1) || "S"}</b>}
    </span>}
    fileName={file?.name} hasImage={Boolean(image || file)} maxBytes={MAX_AVATAR_BYTES}
    chooseLabel={english ? "Upload icon" : "上传图标"} replaceLabel={english ? "Replace icon" : "更换图标"}
    onSelect={selected => void choose(selected)} disabled={disabled} busy={checking} error={error}
    onRemove={file || (source && !remove) ? () => { onChange(null, Boolean(source)); setError(""); } : undefined}
    removeLabel={english ? "Use default" : "恢复默认"}/>;
}
