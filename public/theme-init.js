(() => {
  try {
    const modes = new Set(["system", "light", "dark"]);
    const preferredMode = localStorage.getItem("evaorbit.appearanceMode");
    const preferredLanguage = localStorage.getItem("evaorbit.uiLanguage");
    const preferredChineseFont = localStorage.getItem("evaorbit.chineseFont");
    const preferredEnglishFont = localStorage.getItem("evaorbit.englishFont");
    const appearance = modes.has(preferredMode) ? preferredMode : "system";
    const localBaseline = document.documentElement.dataset.localAppearance === "true";
    const language = preferredLanguage === "en" || preferredLanguage === null && localBaseline ? "en" : "zh-CN";
    const mode = appearance === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : appearance;
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.mode = mode;
    root.dataset.designTheme = "vintage";
    root.dataset.theme = "vintage";
    root.dataset.locale = language;
    root.lang = language;
    root.dataset.chineseFont = ["canger", "lxgw", "alimama", "ibm"].includes(preferredChineseFont) ? preferredChineseFont : "canger";
    root.dataset.englishFont = ["zen", "ibm", "polyamine", "cormorant"].includes(preferredEnglishFont) ? preferredEnglishFont : preferredEnglishFont === null && localBaseline ? "ibm" : "zen";
    root.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#202124" : "#f2f3f5");
  } catch {}
})();
