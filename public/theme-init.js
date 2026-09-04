(() => {
  try {
    const modes = new Set(["system", "light", "dark"]);
    const themes = new Set(["editorial", "rosewood", "powderblue"]);
    const preferredMode = localStorage.getItem("evaorbit.appearanceMode");
    const preferredTheme = localStorage.getItem("evaorbit.colorTheme");
    const preferredLanguage = localStorage.getItem("evaorbit.uiLanguage");
    const preferredChineseFont = localStorage.getItem("evaorbit.chineseFont");
    const preferredEnglishFont = localStorage.getItem("evaorbit.englishFont");
    const appearance = modes.has(preferredMode) ? preferredMode : "system";
    const theme = themes.has(preferredTheme) ? preferredTheme : "editorial";
    const language = preferredLanguage === "en" ? "en" : "zh-CN";
    const mode = appearance === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : appearance;
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.mode = mode;
    root.dataset.theme = theme;
    root.dataset.locale = language;
    root.lang = language;
    root.dataset.chineseFont = ["canger", "lxgw", "alimama", "ibm"].includes(preferredChineseFont) ? preferredChineseFont : "canger";
    root.dataset.englishFont = ["zen", "ibm", "polyamine", "cormorant"].includes(preferredEnglishFont) ? preferredEnglishFont : "zen";
    root.style.colorScheme = mode;
  } catch {}
})();
