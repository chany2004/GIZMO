(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("QUESTER service worker registration failed:", error);
      });
    });
  }

  let installPrompt = null;
  let installButton = null;

  const removeButton = () => {
    installButton?.remove();
    installButton = null;
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton || window.matchMedia("(display-mode: standalone)").matches) return;

    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.textContent = "Install QUESTER";
    installButton.setAttribute("aria-label", "Install QUESTER on this device");
    Object.assign(installButton.style, {
      position: "fixed",
      right: "16px",
      bottom: "calc(16px + env(safe-area-inset-bottom))",
      zIndex: "10000",
      border: "0",
      borderRadius: "999px",
      padding: "12px 18px",
      color: "#ffffff",
      background: "#6757d9",
      boxShadow: "0 8px 24px rgba(17, 24, 51, .3)",
      font: '700 14px "DM Sans", sans-serif',
      cursor: "pointer"
    });

    installButton.addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      removeButton();
    });

    document.body.appendChild(installButton);
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    removeButton();
  });
})();
