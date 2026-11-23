export type Settings = { apiUrl: string; secret: string };

export async function getSettings(): Promise<Settings> {
  return (await chrome.storage.local.get({ apiUrl: "", secret: "" })) as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    apiUrl: settings.apiUrl.trim().replace(/\/+$/, ""),
    secret: settings.secret.trim(),
  });
}
