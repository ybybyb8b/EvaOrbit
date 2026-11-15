"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parlorAppearanceImages, parlorImageLimit, parlorImageTypes, prepareParlorAppearanceImage, readParlorAppearance, saveParlorAppearanceImage, type ParlorAppearanceImage } from "@/lib/parlor-appearance";
import { ErrorNotice } from "./error-notice";
import { FormSheet } from "./form-sheet";
import styles from "./parlor-chat.module.css";

const segmentRepliesKey = (scope: string) => `evaorbit.hermes.segmentReplies:${scope}`;

export function useParlorAppearance(scope: string | null) {
  const urls = useRef<Partial<Record<ParlorAppearanceImage, string>>>({});
  const mounted = useRef(false);
  const [images, setImages] = useState<typeof urls.current>({});
  const [ready, setReady] = useState(false);
  const [segmentReplies, setSegmentReplies] = useState(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (scope) void readParlorAppearance(scope).then(saved => {
      if (!active) return;
      for (const kind of parlorAppearanceImages) {
        const image = saved[kind];
        if (image) urls.current[kind] = URL.createObjectURL(image);
      }
      setImages({ ...urls.current });
    }).catch(() => { /* The chat can render with its default appearance. */ }).finally(() => {
      if (!active) return;
      try { setSegmentReplies(Boolean(scope && localStorage.getItem(segmentRepliesKey(scope)) === "true")); }
      catch { setSegmentReplies(false); }
      setReady(true);
    });
    return () => {
      active = false;
      mounted.current = false;
      for (const url of Object.values(urls.current)) URL.revokeObjectURL(url);
      urls.current = {};
    };
  }, [scope]);

  async function save(kind: ParlorAppearanceImage, image: Blob | null) {
    if (!scope) return;
    await saveParlorAppearanceImage(scope, kind, image);
    if (!mounted.current) return;
    const previous = urls.current[kind];
    if (image) urls.current[kind] = URL.createObjectURL(image);
    else delete urls.current[kind];
    if (previous) URL.revokeObjectURL(previous);
    setImages({ ...urls.current });
  }

  function saveSegmentReplies(enabled: boolean) {
    if (!scope) return;
    localStorage.setItem(segmentRepliesKey(scope), String(enabled));
    setSegmentReplies(enabled);
  }

  return { images, ready, save, segmentReplies, saveSegmentReplies };
}

export function ParlorAppearanceSheet({ appearance, english, onClose }: {
  appearance: ReturnType<typeof useParlorAppearance>;
  english: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const segmentId = useId();
  const t = (en: string, zh: string) => english ? en : zh;
  const labels = {
    assistant: t("Persona avatar", "人格头像"),
    user: t("Your avatar", "你的头像"),
    wallpaper: t("Chat background", "聊天背景"),
  };

  async function change(kind: ParlorAppearanceImage, file: File | null) {
    setError("");
    if (file && (!parlorImageTypes.split(",").includes(file.type) || file.size > parlorImageLimit)) {
      setError(t("Choose a JPG, PNG, or WebP image under 20 MB.", "请选择 20 MB 以内的 JPG、PNG 或 WebP 图片。"));
      return;
    }
    setBusy(true);
    try {
      let image: Blob | null = null;
      if (file) {
        try { image = await prepareParlorAppearanceImage(file, kind); }
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
      <label className={styles.appearanceToggle}>
        <span>
          <strong id={segmentId}>{t("Split replies into bubbles", "自动分段气泡")}</strong>
          <small id={`${segmentId}-hint`}>{t("Show replies in separate bubbles by paragraph or block.", "按段落或内容块拆分回复。")}</small>
        </span>
        <input type="checkbox" role="switch" className="toggle-switch" aria-labelledby={segmentId} aria-describedby={`${segmentId}-hint`}
          checked={appearance.segmentReplies} disabled={!appearance.ready || busy}
          onChange={event => {
            setError("");
            try { appearance.saveSegmentReplies(event.currentTarget.checked); }
            catch { setError(t("Could not save this setting on this device.", "无法在当前设备保存此设置。")); }
          }} />
      </label>
      {parlorAppearanceImages.map(kind => {
        const url = appearance.images[kind];
        return <div className={styles.appearanceRow} key={kind}>
          <span className={styles.appearancePreview} data-kind={kind} style={url ? { backgroundImage: `url("${url}")` } : undefined} aria-hidden="true" />
          <div className={styles.appearanceControls}>
            <strong>{labels[kind]}</strong>
            <div>
              <label className={styles.appearancePicker}>
                {url ? t("Replace", "更换") : t("Choose image", "选择图片")}
                <input type="file" accept={parlorImageTypes} disabled={busy || !appearance.ready} aria-label={labels[kind]} onChange={event => {
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
      <small>{t("Appearance is saved on this device.", "聊天外观设置保存在当前设备。")}</small>
      {error && <ErrorNotice inline>{error}</ErrorNotice>}
    </div>
  </FormSheet>;
}
