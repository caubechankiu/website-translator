// Side panel chỉ mở ở tab mà người dùng chủ động bấm icon, không mở chung cho mọi tab.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error(err));

// Tắt panel mặc định (toàn cục) để các tab khác không hiển thị panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false }).catch((err) => console.error(err));
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // Không await setOptions: open() phải được gọi ngay trong user gesture.
  chrome.sidePanel
    .setOptions({ tabId: tab.id, path: `sidepanel.html?tabId=${tab.id}`, enabled: true })
    .catch((err) => console.error(err));
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error(err));
});
