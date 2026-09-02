(() => {
  try {
    const modes = new Set(["system", "light", "dark"]);
    const themes = new Set(["editorial", "rosewood"]);
    const preferredMode = localStorage.getItem("evaorbit.appearanceMode");
    const preferredTheme = localStorage.getItem("evaorbit.colorTheme");
    const appearance = modes.has(preferredMode) ? preferredMode : "system";
    const theme = themes.has(preferredTheme) ? preferredTheme : "editorial";
    const mode = appearance === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : appearance;
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.mode = mode;
    root.dataset.theme = theme;
    root.style.colorScheme = mode;
  } catch {}
})();
