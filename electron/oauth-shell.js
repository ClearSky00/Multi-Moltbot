"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("closeBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      if (window.oauthShell && typeof window.oauthShell.close === "function") {
        void window.oauthShell.close();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      window.oauthShell &&
      typeof window.oauthShell.close === "function"
    ) {
      void window.oauthShell.close();
    }
  });
});
