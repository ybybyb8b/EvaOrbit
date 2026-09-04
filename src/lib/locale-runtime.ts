import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, type UiLanguage } from "./locale";
import { translateUiCopy } from "./ui-copy";

export const UI_LANGUAGE_STORAGE_KEY = "evaorbit.uiLanguage";

export function storedUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return DEFAULT_UI_LANGUAGE;
  return normalizeUiLanguage(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY));
}

export function applyUiLanguage(language: UiLanguage, persist = true) {
  const root = document.documentElement;
  root.dataset.locale = language;
  root.lang = language;
  if (persist) window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent("evaorbit:language-applied", { detail: { language } }));
}

const COPY_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;
const PERSONAL_CONTENT = ".user-content,.markdown-content,.message-content,.long-term-prose,[contenteditable='true'],[data-no-translate]";
const TEXT_COPY_STATE = new WeakMap<Text, { source: string; translated: string }>();
const ATTRIBUTE_COPY_STATE = new WeakMap<Element, Map<string, { source: string; translated: string }>>();

function translateTextNode(node: Text, language: UiLanguage) {
  const current = node.nodeValue ?? "";
  const previous = TEXT_COPY_STATE.get(node);
  const source = previous && current === previous.translated ? previous.source : current;
  const translated = translateUiCopy(source, language);
  TEXT_COPY_STATE.set(node, { source, translated });
  if (translated !== current) node.nodeValue = translated;
}

function translateElement(element: Element, language: UiLanguage) {
  if (element.matches(PERSONAL_CONTENT) || element.closest(PERSONAL_CONTENT)) return;
  for (const attribute of COPY_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const states = ATTRIBUTE_COPY_STATE.get(element) ?? new Map<string, { source: string; translated: string }>();
    const previous = states.get(attribute);
    const source = previous && value === previous.translated ? previous.source : value;
    const translated = translateUiCopy(source, language);
    states.set(attribute, { source, translated });
    ATTRIBUTE_COPY_STATE.set(element, states);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function translateTree(root: Node, language: UiLanguage) {
  if (root instanceof Element) translateElement(root, language);
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement;
    if (parent && !parent.matches(PERSONAL_CONTENT) && !parent.closest(PERSONAL_CONTENT)) {
      translateTextNode(root as Text, language);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Element) translateElement(node, language);
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent && !parent.matches(PERSONAL_CONTENT) && !parent.closest(PERSONAL_CONTENT)) {
        translateTextNode(node as Text, language);
      }
    }
    node = walker.nextNode();
  }
}

export function installUiCopyBridge(language: UiLanguage) {
  const translateTitle = () => {
    const suffix = " · EvaOrbit";
    if (!document.title.endsWith(suffix)) return;
    const title = document.title.slice(0, -suffix.length);
    const translated = translateUiCopy(title, language);
    if (translated !== title) document.title = `${translated}${suffix}`;
  };
  translateTitle();
  translateTree(document.body, language);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") translateElement(mutation.target as Element, language);
      else if (mutation.type === "characterData") translateTree(mutation.target, language);
      else mutation.addedNodes.forEach(node => translateTree(node, language));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...COPY_ATTRIBUTES] });
  const titleObserver = new MutationObserver(translateTitle);
  titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true });
  return () => { observer.disconnect(); titleObserver.disconnect(); };
}
