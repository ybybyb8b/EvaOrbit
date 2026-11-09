"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useDeferredValue, useState } from "react";
import type { Element, Root } from "hast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeMarkdownUrl(value: string, key: string) {
  const url = value.trim();
  if (url.startsWith("#") || url.startsWith("./") || url.startsWith("../") || (url.startsWith("/") && !url.startsWith("//"))) return url;
  try {
    const protocol = new URL(url).protocol;
    if (protocol === "http:" || protocol === "https:" || (key === "href" && protocol === "mailto:")) return url;
  } catch {
    return "";
  }
  return "";
}

function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const language = className?.match(/language-([\w-]+)/)?.[1];
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <div className="markdown-code-block">
    <div className="markdown-code-head"><span>{language || "code"}</span><button type="button" onClick={() => void copy()}>{copied ? "复制好了" : "复制"}</button></div>
    <pre><code className={className}>{code}</code></pre>
  </div>;
}

function Table({ children, ...props }: ComponentPropsWithoutRef<"table">) {
  return <div className="markdown-table-wrap" tabIndex={0}><table {...props}>{children}</table></div>;
}

function Link({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//i.test(href);
  return <a {...props} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
}

function groupMarkdownBlocks() {
  return (tree: Root) => {
    const groups: Element[][] = [];
    let group: Element[] = [];
    for (const child of tree.children) {
      if (child.type !== "element") continue;
      group.push(child);
      if (/^h[1-6]$/.test(child.tagName)) continue;
      groups.push(group);
      group = [];
    }
    if (group.length) groups.push(group);
    tree.children = groups.map((children, index) => ({
      type: "element", tagName: "div", properties: { dataMarkdownLast: index === groups.length - 1 }, children,
    }));
  };
}

export function MarkdownMessage({ content, offlineMedia = false, renderBlock }: {
  content: string;
  offlineMedia?: boolean;
  renderBlock?: (children: ReactNode, last: boolean) => ReactNode;
}) {
  const renderedContent = useDeferredValue(content);
  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={renderBlock ? [groupMarkdownBlocks] : undefined}
      skipHtml
      urlTransform={safeMarkdownUrl}
      components={{
        ...(renderBlock ? { div: ({ children, node }) => renderBlock(
          <div className="markdown-content">{children}</div>, node?.properties.dataMarkdownLast === true,
        ) } : {}),
        a: offlineMedia ? ({children}) => <span>{children}</span> : Link,
        ...(offlineMedia ? {img: ({alt}: {alt?:string}) => <span className="chronicle-offline-image">{alt || "Image"} · Image unavailable offline</span>} : {}),
        table: Table,
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...props }) => {
          const value = String(children);
          const block = Boolean(className?.startsWith("language-")) || value.includes("\n");
          return block ? <CodeBlock className={className}>{children}</CodeBlock> : <code className={className} {...props}>{children}</code>;
        },
        input: ({ type, ...props }) => type === "checkbox" ? <input type="checkbox" {...props} disabled /> : <input type={type} {...props} />,
      }}
    >{renderedContent}</ReactMarkdown>
  );
  return renderBlock ? markdown : <div className="markdown-content">{markdown}</div>;
}
