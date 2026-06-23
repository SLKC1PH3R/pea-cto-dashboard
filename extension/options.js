const input = document.getElementById("token");
const status = document.getElementById("status");

folioGetToken().then((token) => {
  if (token) input.value = token;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim();
  await chrome.storage.local.set({ [FOLIO_TOKEN_KEY]: value || null });
  status.textContent = value ? "Token enregistré." : "Token supprimé.";
  chrome.runtime.sendMessage({ type: "folio-refresh-now" });
  setTimeout(() => (status.textContent = ""), 2000);
});
