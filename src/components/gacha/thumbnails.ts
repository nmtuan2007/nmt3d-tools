import { fetchImage } from "../../services/tauriBridge";

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Decoded thumbnail from a blob: URL, so drawing it keeps the recorded canvas origin-clean. */
export function loadThumb(url: string): Promise<HTMLImageElement> {
  let img = cache.get(url);
  if (!img) {
    img = fetchImage(url).then(async (buf) => {
      const el = new Image();
      el.src = URL.createObjectURL(new Blob([buf]));
      await el.decode();
      return el;
    });
    img.catch(() => cache.delete(url));
    cache.set(url, img);
  }
  return img;
}
