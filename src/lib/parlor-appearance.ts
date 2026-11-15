export type ParlorAppearanceImage = "assistant" | "user" | "wallpaper";
export const parlorAppearanceImages: ParlorAppearanceImage[] = ["assistant", "user", "wallpaper"];

function openAppearanceStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("eo-hermes-appearance", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readParlorAppearance(scope: string): Promise<Partial<Record<ParlorAppearanceImage, Blob>>> {
  const db = await openAppearanceStore();
  try {
    const images: Partial<Record<ParlorAppearanceImage, Blob>> = {};
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("images", "readonly");
      const store = transaction.objectStore("images");
      for (const kind of parlorAppearanceImages) {
        const request = store.get([scope, kind]);
        request.onsuccess = () => {
          if (request.result instanceof Blob) images[kind] = request.result;
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    return images;
  } finally {
    db.close();
  }
}

export async function saveParlorAppearanceImage(scope: string, kind: ParlorAppearanceImage, image: Blob | null) {
  const db = await openAppearanceStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("images", "readwrite");
      const store = transaction.objectStore("images");
      if (image) store.put(image, [scope, kind]);
      else store.delete([scope, kind]);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const parlorImageTypes = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif";
export const parlorImageLimit = 20 * 1024 * 1024;

export async function prepareParlorAppearanceImage(file: File, kind: ParlorAppearanceImage): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 50_000_000) throw new Error("Invalid image dimensions");
    const canvas = document.createElement("canvas");
    const wallpaper = kind === "wallpaper";
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const crop = Math.min(width, height);
    canvas.width = wallpaper ? Math.max(1, Math.round(width * scale)) : Math.min(crop, 256);
    canvas.height = wallpaper ? Math.max(1, Math.round(height * scale)) : canvas.width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image resizing unavailable");
    if (wallpaper) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      context.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed")), wallpaper ? "image/jpeg" : "image/png", .82);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
