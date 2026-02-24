import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { readDocsMarkdown } from "@/lib/docs-reader";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

type Crumb = {
  label: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExternalHref(href: string): boolean {
  return /^https?:\/\//iu.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

function formatCrumbLabel(segment: string): string {
  return segment
    .replace(/\.md$/iu, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildCrumbs(slug: string[]): Crumb[] {
  return slug.map((segment) => ({
    label: formatCrumbLabel(segment)
  }));
}

function estimateReadMinutes(content: string): number {
  const words = content.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function resolveMarkdownHref(href: string | undefined, currentDocPath: string): string | undefined {
  if (!href || href.startsWith("#") || isExternalHref(href) || href.startsWith("/")) {
    return href;
  }

  const hashIndex = href.indexOf("#");
  const rawPath = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";

  if (!rawPath) {
    return hash || href;
  }

  const sourceDir = path.posix.dirname(currentDocPath);
  const normalizedPath = path.posix.normalize(path.posix.join(sourceDir, rawPath));
  if (normalizedPath === ".." || normalizedPath.startsWith("../")) {
    return href;
  }

  const extension = path.posix.extname(normalizedPath).toLowerCase();
  if (extension && extension !== ".md") {
    return href;
  }

  const docsTarget = extension === ".md" ? normalizedPath : `${normalizedPath}.md`;
  const cleanedTarget = docsTarget.replace(/^\.\//u, "");

  return `/docs/${cleanedTarget}${hash}`;
}

export default async function DocsMarkdownPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await readDocsMarkdown(slug);

  if (!doc) {
    notFound();
  }

  const crumbs = buildCrumbs(doc.slug);
  const readMinutes = estimateReadMinutes(doc.content);

  const markdownComponents: Components = {
    a({ node: _node, href, children, ...props }) {
      const resolvedHref = resolveMarkdownHref(href, doc.relativePath);
      const external = typeof resolvedHref === "string" && isExternalHref(resolvedHref);

      return (
        <a
          {...props}
          href={resolvedHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {children}
        </a>
      );
    },
    pre({ node: _node, className, children, ...props }) {
      return (
        <pre {...props} className={["docs-reader-pre", className].filter(Boolean).join(" ")}>
          {children}
        </pre>
      );
    },
    table({ node: _node, children }) {
      return (
        <div className="docs-reader-table-wrap">
          <table>{children}</table>
        </div>
      );
    }
  };

  return (
    <main className="docs-reader-shell">
      <section className="docs-reader-header card">
        <nav className="docs-breadcrumbs" aria-label="Document breadcrumb">
          <Link href="/docs">Docs</Link>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="docs-breadcrumb-item">
                <span className="docs-breadcrumb-separator">/</span>
                <span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
              </span>
            );
          })}
        </nav>

        <div className="docs-reader-meta">
          <span className="kicker">Markdown Reader</span>
          <h1>{doc.title}</h1>
          <p>
            <span className="mono">{doc.relativePath}</span>
            {" · "}
            {readMinutes} min read
          </p>
          <div className="actions docs-reader-actions">
            <Link className="btn btn-secondary" href="/docs">
              Back to docs
            </Link>
            <a className="btn btn-primary" href="/api/docs/download" download>
              Download archive
            </a>
          </div>
        </div>
      </section>

      <article className="docs-reader-prose card">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {doc.content}
        </ReactMarkdown>
      </article>
    </main>
  );
}
