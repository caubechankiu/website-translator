import type { Anchor } from "../../shared/render";
import { getSettings } from "./settings";

export type Translation = {
  url: string;
  translatedContent: string;
  translatedAt: string;
  /** Anchor tiêu đề của bản gốc (API cũ chưa có). */
  anchors?: Anchor[];
  cached: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiUrl, secret } = await getSettings();
  if (!apiUrl || !secret) {
    throw new ApiError("Chưa cấu hình API URL / SECRET — mở trang Cài đặt (⚙).", 0);
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(`Không kết nối được API tại ${apiUrl}`, 0);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

/** Bản dịch đã lưu, hoặc undefined nếu trang chưa được dịch. */
export async function getSavedTranslation(url: string): Promise<Translation | undefined> {
  try {
    return await request<Translation>(`/api/websites?url=${encodeURIComponent(url)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

export function translate(url: string, content: string, force = false): Promise<Translation> {
  return request<Translation>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ url, content, force }),
  });
}

/** URL proxy /api/image cho ảnh trang gốc chặn nhúng từ origin khác (SECRET đi qua query vì <img> không gửi được header). */
export async function imageProxyUrl(url: string): Promise<string> {
  const { apiUrl, secret } = await getSettings();
  if (!apiUrl || !secret) throw new ApiError("Chưa cấu hình API URL / SECRET", 0);
  return `${apiUrl}/api/image?${new URLSearchParams({ url, token: secret })}`;
}
