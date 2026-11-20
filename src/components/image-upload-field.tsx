"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ErrorNotice } from "./error-notice";
import { useFormPreview } from "./form-preview";
import { Icon, type IconName } from "./icons";
import { useLocale } from "./locale-controller";
import styles from "./image-upload-field.module.css";

const imageTypes = "image/jpeg,image/png,image/webp";

export function useImageFilePreview(file?: File | null) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : undefined;
    let active = true;
    queueMicrotask(() => { if (active) setPreview(file && url ? { file, url } : undefined); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  return preview?.file === file ? preview?.url : undefined;
}

export function ImageUploadButton({ label, onSelect, accept = imageTypes, disabled, busy, pressed, children }: {
  label: string; onSelect?: (file: File) => void; accept?: string; disabled?: boolean;
  busy?: boolean; pressed?: boolean; children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { english } = useLocale();
  const blocked = useFormPreview() || disabled || busy || !onSelect;
  return <>
    <button className={styles.choose} type="button" aria-pressed={pressed} aria-busy={busy} disabled={blocked}
      onClick={() => input.current?.click()}>
      {busy ? (english ? "Processing…" : "处理中…") : children ?? label}
    </button>
    <input ref={input} hidden type="file" aria-label={label} accept={accept} disabled={blocked} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file && !blocked) onSelect?.(file);
    }}/>
  </>;
}

export function ImageUploadField({
  title, inputLabel = title, file, fileName, source, thumbnail, hasImage = Boolean(file || fileName || source),
  shape = "square", icon = "media", onSelect, onRemove, removeLabel, chooseLabel, replaceLabel,
  help, accept = imageTypes, maxBytes, disabled, busy, error, className,
}: {
  title: string; inputLabel?: string; file?: File | null; fileName?: string; source?: string | null; thumbnail?: ReactNode; hasImage?: boolean;
  shape?: "square" | "round" | "portrait" | "landscape"; icon?: IconName;
  onSelect?: (file: File) => void; onRemove?: () => void; removeLabel?: string; chooseLabel?: string; replaceLabel?: string;
  help?: string; accept?: string; maxBytes?: number; disabled?: boolean; busy?: boolean; error?: string; className?: string;
}) {
  const { english } = useLocale();
  const previewOnly = useFormPreview();
  const url = useImageFilePreview(file) ?? source;
  const [validationError, setValidationError] = useState("");
  const formatHelp = maxBytes && (english ? `JPG, PNG or WebP · up to ${maxBytes / 1024 ** 2} MB` : `JPG、PNG 或 WebP · 最大 ${maxBytes / 1024 ** 2} MB`);
  const action = hasImage ? replaceLabel ?? (english ? "Replace image" : "更换图片") : chooseLabel ?? (english ? "Choose image" : "选择图片");
  return <div className={[styles.field, className].filter(Boolean).join(" ")} role="group" aria-label={title}>
    <div className={styles.row} aria-busy={busy}>
      <span className={styles.thumbnail} data-shape={shape} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" /> : thumbnail ?? <Icon name={icon}/>}
      </span>
      <div className={styles.details}>
        <strong>{title}</strong>
        {(file || fileName || help || formatHelp) && <small className={file || fileName ? "user-content" : undefined}>{file?.name ?? fileName ?? help ?? formatHelp}</small>}
        <div className={styles.actions}>
          <ImageUploadButton label={inputLabel} accept={accept} disabled={disabled} busy={busy} onSelect={onSelect && (selected => {
            setValidationError("");
            if (maxBytes && (!selected.size || selected.size > maxBytes)) {
              setValidationError(english ? `Choose an image up to ${maxBytes / 1024 ** 2} MB.` : `请选择不超过 ${maxBytes / 1024 ** 2} MB 的图片。`);
            } else if (accept === imageTypes && selected.type && !imageTypes.split(",").includes(selected.type)) {
              setValidationError(english ? "Choose a JPG, PNG or WebP image." : "请选择 JPG、PNG 或 WebP 图片。");
            } else onSelect(selected);
          })}>{action}</ImageUploadButton>
          {onRemove && <button className={styles.remove} type="button" data-form-change disabled={previewOnly || disabled || busy}
            onClick={() => { setValidationError(""); onRemove(); }}>{removeLabel ?? (english ? "Remove" : "移除")}</button>}
        </div>
      </div>
    </div>
    {(validationError || error) && <ErrorNotice inline role="alert">{validationError || error}</ErrorNotice>}
  </div>;
}
