import { getSavedTranslation } from "./api";
import { getSettings, saveSettings } from "./settings";

const form = document.getElementById("form") as HTMLFormElement;
const apiUrl = document.getElementById("apiUrl") as HTMLInputElement;
const secret = document.getElementById("secret") as HTMLInputElement;
const testBtn = document.getElementById("test") as HTMLButtonElement;
const status = document.getElementById("status")!;

function show(message: string, kind: "done" | "error" | "loading") {
  status.textContent = message;
  status.className = `status ${kind}`;
}

getSettings().then((s) => {
  apiUrl.value = s.apiUrl;
  secret.value = s.secret;
});

/**
 * Xin quyền gọi tới origin của API (để không bị CORS chặn).
 * Phải gọi ngay trong handler click, trước mọi `await` khác, vì Chrome yêu cầu user gesture.
 */
function requestApiPermission(): Promise<boolean> {
  const origin = new URL(apiUrl.value.trim()).origin;
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

async function save(): Promise<boolean> {
  if (!form.reportValidity()) return false;
  const granted = await requestApiPermission();
  if (!granted) {
    show("Cần cấp quyền truy cập API URL thì extension mới gọi được API.", "error");
    return false;
  }
  await saveSettings({ apiUrl: apiUrl.value, secret: secret.value });
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await save()) show("Đã lưu.", "done");
});

testBtn.addEventListener("click", async () => {
  if (!(await save())) return;
  show("Đang kiểm tra…", "loading");
  try {
    // URL bất kỳ: 200 hoặc 404 đều chứng tỏ API chạy và SECRET đúng.
    await getSavedTranslation("https://example.com/");
    show("Kết nối thành công, đã lưu.", "done");
  } catch (err) {
    show((err as Error).message, "error");
  }
});
