"use client";

import { useEffect, useRef, useState } from "react";
import { hermesAppearanceImages, hermesImageLimit, hermesImageTypes, prepareHermesAppearanceImage, readHermesAppearance, saveHermesAppearanceImage, type HermesAppearanceImage } from "@/lib/hermes-appearance";
import { ErrorNotice } from "./error-notice";
import { FormSheet } from "./form-sheet";
import styles from "./hermes-chat.module.css";

export function useHermesAppearance(scope: string | null) {
  const urls = useRef<Partial<Record<HermesAppearanceImage, string>>>({});
  const mounted = useRef(false);
  const [images, setImages] = useState<typeof urls.current>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (scope) void readHermesAppearance(scope).then(saved => {
      if (!active) return;
      for (const kind of hermesAppearanceImages) {
        const image = saved[kind];
        if (image) urls.current[kind] = URL.createObjectURL(image);
      }
      setImages({ ...urls.current });
    }).catch(() => { /* The chat can render with its default appearance. */ }).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      mounted.current = false;
      for (const url of Object.values(urls.current)) URL.revokeObjectURL(url);
      urls.current = {};
    };
  }, [scope]);

  async function save(kind: HermesAppearanceImage, image: Blob | null) {
    if (!scope) return;
    await saveHermesAppearanceImage(scope, kind, image);
    if (!mounted.current) return;
    const previous = urls.current[kind];
    if (image) urls.current[kind] = URL.createObjectURL(image);
    else delete urls.current[kind];
    if (previous) URL.revokeObjectURL(previous);
    setImages({ ...urls.current });
  }

  return { images, ready, save };
}

export function HermesAppearanceSheet({ appearance, english, onClose }: {
  appearance: ReturnType<typeof useHermesAppearance>;
  english: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (en: string, zh: string) => english ? en : zh;
  const labels = {
    assistant: t("Hermes avatar", "Hermes 头像"),
    user: t("Your avatar", "你的头像"),
    wallpaper: t("Chat background", "聊天背景"),
  };

  async function change(kind: HermesAppearanceImage, file: File | null) {
    setError("");
    if (file && (!hermesImageTypes.split(",").includes(file.type) || file.size > hermesImageLimit)) {
      setError(t("Choose a JPG, PNG, or WebP image under 20 MB.", "请选择 20 MB 以内的 JPG、PNG 或 WebP 图片。"));
      return;
    }
    setBusy(true);
    try {
      let image: Blob | null = null;
      if (file) {
        try { image = await prepareHermesAppearanceImage(file, kind); }
        catch { setError(t("Could not read this image. Try a different one.", "无法读取这张图片，请换一张试试。")); return; }
      }
      await appearance.save(kind, image);
    } catch {
      setError(t("Could not save the image on this device.", "图片未能保存到当前设备。"));
    } finally {
      setBusy(false);
    }
  }

  return <FormSheet title={t("Chat appearance", "聊天外观")} busy={busy} dirty={false} onClose={onClose}>
    <div className={styles.appearanceList}>
      {hermesAppearanceImages.map(kind => {
        const url = appearance.images[kind];
        return <div className={styles.appearanceRow} key={kind}>
          <span className={styles.appearancePreview} data-kind={kind} style={url ? { backgroundImage: `url("${url}")` } : undefined} aria-hidden="true" />
          <div className={styles.appearanceControls}>
            <strong>{labels[kind]}</strong>
            <div>
              <label className={styles.appearancePicker}>
                {url ? t("Replace", "更换") : t("Choose image", "选择图片")}
                <input type="file" accept={hermesImageTypes} disabled={busy || !appearance.ready} aria-label={labels[kind]} onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void change(kind, file);
                }} />
              </label>
              {url && <button type="button" className="text-button" disabled={busy} aria-label={t(`Reset ${labels[kind]}`, `恢复${labels[kind]}`)} onClick={() => void change(kind, null)}>{t("Reset", "恢复默认")}</button>}
            </div>
          </div>
        </div>;
      })}
      <small>{t("Saved on this device.", "图片保存在当前设备。")}</small>
      {error && <ErrorNotice inline>{error}</ErrorNotice>}
    </div>
  </FormSheet>;
}
