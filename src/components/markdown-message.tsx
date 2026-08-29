"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useDeferredValue, useState } from "react";
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

export function MarkdownMessage({ content }: { content: string }) {
  const renderedContent = useDeferredValue(content);
  return <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={safeMarkdownUrl}
      components={{
        a: Link,
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
  </div>;
}
