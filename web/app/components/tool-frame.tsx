import Link from "next/link";

type ToolFrameProps = {
  title: string;
  description: string;
  path: "/etf-tool" | "/trade-tool";
};

export function ToolFrame({ title, description, path }: ToolFrameProps) {
  const backend = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const source = `${backend}${path}`;

  return (
    <main className="integrated-tool-page">
      <header className="integrated-tool-header">
        <div>
          <Link href="/">← 返回安心看股</Link>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span>分析与复盘工具 · 不构成投资建议</span>
      </header>
      <section className="integrated-tool-frame-shell">
        <iframe title={title} src={source} allow="clipboard-write" />
        <noscript>请启用 JavaScript 后使用该工具。</noscript>
      </section>
      <footer className="integrated-tool-footer">
        本工具仅用于持仓分析和交易复盘参考，不构成投资建议、收益承诺或买卖建议。
      </footer>
    </main>
  );
}
