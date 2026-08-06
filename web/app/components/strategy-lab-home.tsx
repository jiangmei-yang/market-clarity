import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Layers3, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

export function StrategyLabHome() {
  return <div className="strategy-lab-site">
    <header className="lab-home-nav">
      <Link href="/" className="lab-home-brand"><span><FlaskConical /></span><strong>Market Clarity</strong><small>STRATEGY LAB</small></Link>
      <nav aria-label="产品导航"><Link href="/workspace">AI 工作台</Link><Link href="/quant/factors" aria-current="page">策略研究室</Link><Link href="/pricing">定价</Link><Link href="/quant/factors">开始研究 <ArrowRight /></Link></nav>
    </header>
    <main>
      <section className="lab-home-hero">
        <div className="lab-home-copy"><span><i /> AI 策略研究室</span><h1>把一句投资想法，<em>变成可验证的方法。</em></h1><p>不用写公式。你确认规则，系统批量比较候选，再用未参与调参的历史区间做最后检查。</p><div><Link href="/quant/factors">开始一次研究 <ArrowRight /></Link><a href="#how">先看 60 秒原理</a></div><small><ShieldCheck />历史研究，不是荐股；不会连接券商或自动交易。</small></div>
        <div className="lab-home-product" aria-label="策略研究室界面示意">
          <header><span><i />历史比较 · 界面示意</span><b>同样本 · 同成本</b></header>
          <div className="lab-preview-prompt"><Sparkles /><span><small>你的目标</small><strong>我想找一个回撤没那么大、表现更稳的方法。</strong></span><Check /></div>
          <div className="lab-preview-chart">
            <div><span><i className="candidate" />候选方法</span><span><i className="reference" />传统动量</span></div>
            <svg viewBox="0 0 620 270" role="img" aria-label="候选方法与传统动量的示意历史曲线，包含研究、验证和锁定三段">
              <defs><linearGradient id="lab-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#60a5fa" stopOpacity=".22"/><stop offset="1" stopColor="#60a5fa" stopOpacity="0"/></linearGradient></defs>
              <g className="grid"><path d="M54 42H592M54 98H592M54 154H592M54 210H592"/><path d="M54 28V226M232 28V226M410 28V226M592 28V226"/></g>
              <path className="candidate-area" d="M54 190 C110 177 132 152 178 160 S248 110 286 126 S350 92 398 105 S470 58 520 76 S565 52 592 42 L592 226 L54 226Z"/>
              <path className="reference-line" d="M54 190 C104 183 138 164 180 174 S250 140 290 150 S360 126 404 139 S470 112 516 120 S560 98 592 105"/>
              <path className="candidate-line" d="M54 190 C110 177 132 152 178 160 S248 110 286 126 S350 92 398 105 S470 58 520 76 S565 52 592 42"/>
              <g className="axis"><text x="54" y="250">研究区</text><text x="278" y="250">验证区</text><text x="500" y="250">锁定检查</text><text x="12" y="45">高</text><text x="12" y="214">低</text></g>
            </svg>
          </div>
          <footer><span><small>扫描</small><strong>500 组</strong></span><i><ArrowRight /></i><span><small>进入锁定检查</small><strong>2 个</strong></span><i><ArrowRight /></i><span className="kept"><small>保留</small><strong>1 个</strong></span></footer>
        </div>
      </section>
      <section id="how" className="lab-home-steps"><header><span>一条完整闭环</span><h2>你只需要做三次决定。</h2></header><div><article><b>01</b><FlaskConical /><h3>说出想法或目标</h3><p>“走势强，但波动不要太大”就够了。</p></article><article><b>02</b><Layers3 /><h3>确认系统理解</h3><p>股票范围、排序、调仓和成本都能看见。</p></article><article><b>03</b><RefreshCw /><h3>比较、保存、再检验</h3><p>每个候选单独展示，不用平均值藏住差异。</p></article></div></section>
      <section id="trust" className="lab-home-trust"><div><span>不是黑箱“找最高收益”</span><h2>先定规则，再打开最后一段历史。</h2><p>研究区可以生成候选，验证区负责淘汰不稳定的方法。候选确定后才打开锁定测试区，结果不能再用于继续调参。</p><Link href="/quant/factors">亲自跑一次 <ArrowRight /></Link></div><ol><li><span><Check /></span><div><strong>固定传统参照</strong><small>同样本、同时间、同成本</small></div></li><li><span><LockKeyhole /></span><div><strong>锁定最后区间</strong><small>只验收，不回头改参数</small></div></li><li><span><ShieldCheck /></span><div><strong>保存的是研究方法</strong><small>可复制、可重检，不是买卖信号</small></div></li></ol></section>
    </main>
    <footer className="lab-home-footer"><div><FlaskConical /><strong>Market Clarity</strong><span>Strategy Lab · Research only</span></div><p>历史结果不能预测未来表现。本产品不提供个股推荐或交易执行。</p></footer>
  </div>;
}
