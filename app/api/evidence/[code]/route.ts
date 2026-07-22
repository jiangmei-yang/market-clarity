import { NextResponse } from "next/server";
import { readCached, storeCached } from "../../../lib/data-cache";
import { freshness, reliabilityFromFreshness, reliability } from "../../../lib/failure-control";

const DEFAULT_ANXIN_API_URL = "http://127.0.0.1:8001";

type PublicAnnouncement = {
  art_code?: string;
  title?: string;
  notice_date?: string;
};

type CninfoSecurity = { code?: string; orgId?: string; zwjc?: string };
type CninfoAnnouncement = {
  announcementId?: string;
  announcementTitle?: string;
  announcementTime?: number;
  adjunctUrl?: string;
};

const CLAIM_TERMS = ["订单", "回购", "减持", "增持", "业绩", "分红", "合同", "中标", "合作", "产能", "销量", "融资", "并购", "重组"];

function withEvidenceReliability(payload:Record<string,unknown>,sourceName:string,fallbackSource:string|null=null){
  const feed=(payload.feed as {updated_at?:string}|undefined);const fresh=freshness("news",feed?.updated_at??new Date().toISOString(),sourceName,fallbackSource);
  return {...payload,updated_at:fresh.updated_at,max_age:fresh.max_age,freshness_status:fresh.freshness_status,source:fresh.source,fallback_source:fresh.fallback_source,reliability:reliabilityFromFreshness(fresh,{fallback:Boolean(fallbackSource),message:fallbackSource?`已从 ${fallbackSource} 降级到 ${sourceName}`:"公告检索结果在有效期内"})};
}

async function publicAnnouncementEvidence(code: string, reason: string) {
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list=${code}`;
  const payload = await requestJson(url, 6_000) as { data?: { list?: PublicAnnouncement[] } };
  const rows = payload.data?.list ?? [];
  const claimTerms = CLAIM_TERMS.filter((term) => reason.includes(term));
  const items = rows.slice(0, 10).map((item) => {
    const title = item.title || "公司公告";
    const matches = claimTerms.filter((term) => title.includes(term));
    return {
      published_at: item.notice_date || "",
      title,
      summary: matches.length ? `标题包含与原话相关的关键词：${matches.join("、")}。请打开原文核对披露范围。` : "这是近期公司公告，尚不能据此确认用户原话中的具体说法。",
      source: "东方财富公告聚合",
      url: item.art_code ? `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html` : "https://data.eastmoney.com/notices/",
      category: "公司公告",
      relation: matches.length ? "可能相关" : "背景资料",
      corroborating_sources: ["东方财富公告聚合"],
      matched: matches.length > 0,
    };
  });
  const hasMatch = items.some((item) => item.matched);
  return {
    assessment: {
      status: hasMatch ? "找到相关正式披露" : "未找到与原话直接对应的正式披露",
      summary: hasMatch ? "近期公告标题中出现相关关键词，仍需阅读原文确认是否支持完整说法。" : "已检查近期公司公告标题，暂未发现与原话直接对应的披露。未找到不等于事实不存在。",
      mode: "rules" as const,
      evidence_indices: items.map((item, index) => item.matched ? index : -1).filter((index) => index >= 0),
    },
    feed: {
      items: items.map((item) => ({
        published_at: item.published_at,
        title: item.title,
        summary: item.summary,
        source: item.source,
        url: item.url,
        category: item.category,
        relation: item.relation,
        corroborating_sources: item.corroborating_sources,
      })),
      data_mode: "live",
      updated_at: new Date().toISOString(),
      sources: ["东方财富公告聚合"],
      message: "公开公告备用检索；请以交易所或公司公告原文为准。",
    },
    radar: {
      total: items.length,
      official_count: items.length,
      media_count: 0,
      opinion_count: 0,
      source_count: items.length ? 1 : 0,
      coverage: "近期公司公告标题",
      disclaimer: "备用检索仅覆盖当前返回的近期公告，不构成投资建议。",
    },
  };
}

async function cninfoAnnouncementEvidence(code: string, reason: string) {
  const securities = await requestJson("https://www.cninfo.com.cn/new/data/szse_stock.json", 8_000, {
    referer: "https://www.cninfo.com.cn/",
    "user-agent": "Mozilla/5.0 (compatible; AnxinDecisionDesk/1.0)",
  }) as { stockList?: CninfoSecurity[] };
  const security = securities.stockList?.find((item) => item.code === code);
  if (!security?.orgId) throw new Error("cninfo security mapping unavailable");
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const body = new URLSearchParams({
    pageNum: "1",
    pageSize: "10",
    column: code.startsWith("6") ? "sse" : "szse",
    tabName: "fulltext",
    plate: code.startsWith("6") ? "sh" : "sz",
    stock: `${code},${security.orgId}`,
    searchkey: "",
    secid: "",
    category: "",
    trade: "",
    seDate: `${date(start)}~${date(end)}`,
    sortName: "",
    sortType: "",
    isHLtitle: "true",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://www.cninfo.com.cn/new/hisAnnouncement/query", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        referer: "https://www.cninfo.com.cn/",
        "user-agent": "Mozilla/5.0 (compatible; AnxinDecisionDesk/1.0)",
      },
      body,
    });
    if (!response.ok) throw new Error(`cninfo ${response.status}`);
    const payload = await response.json() as { announcements?: CninfoAnnouncement[] | null };
    const claimTerms = CLAIM_TERMS.filter((term) => reason.includes(term));
    const items = (payload.announcements ?? []).map((item) => {
      const title = item.announcementTitle || "公司公告";
      const matches = claimTerms.filter((term) => title.includes(term));
      return {
        published_at: item.announcementTime ? new Date(item.announcementTime).toISOString() : "",
        title,
        summary: matches.length ? `标题包含与原话相关的关键词：${matches.join("、")}。请打开公告原文核对披露范围。` : "这是近期法定披露公告，尚不能据此确认用户原话中的具体说法。",
        source: "巨潮资讯 · 法定披露平台",
        url: item.adjunctUrl ? `https://static.cninfo.com.cn/${item.adjunctUrl}` : "https://www.cninfo.com.cn/",
        category: "公司公告",
        relation: matches.length ? "可能相关" : "背景资料",
        corroborating_sources: ["巨潮资讯 · 法定披露平台"],
        matched: matches.length > 0,
      };
    });
    const hasMatch = items.some((item) => item.matched);
    return {
      assessment: {
        status: hasMatch ? "找到相关正式披露" : "未找到与原话直接对应的正式披露",
        summary: hasMatch ? "近期法定披露公告标题中出现相关关键词，仍需阅读原文确认是否支持完整说法。" : "已检查近 90 天法定披露公告标题，暂未发现与原话直接对应的披露。未找到不等于事实不存在。",
        mode: "rules" as const,
        evidence_indices: items.map((item, index) => item.matched ? index : -1).filter((index) => index >= 0),
      },
      feed: {
        items: items.map((item) => ({ published_at: item.published_at, title: item.title, summary: item.summary, source: item.source, url: item.url, category: item.category, relation: item.relation, corroborating_sources: item.corroborating_sources })),
        data_mode: "live",
        updated_at: new Date().toISOString(),
        sources: ["巨潮资讯 · 法定披露平台"],
        message: "法定披露公告备用检索；结论仅覆盖当前查询的近 90 天标题。",
      },
      radar: {
        total: items.length,
        official_count: items.length,
        media_count: 0,
        opinion_count: 0,
        source_count: items.length ? 1 : 0,
        coverage: "近 90 天法定披露公告标题",
        disclaimer: "未找到不等于事实不存在；请以公告 PDF 原文为准。",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(url: string, timeoutMs: number, extraHeaders: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json", ...extraHeaders },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { status: "invalid", message: "请输入 6 位 A 股代码" },
      { status: 400 },
    );
  }

  const reason = new URL(request.url).searchParams.get("reason")?.trim().slice(0, 2000) || "";
  if (!reason) {
    return NextResponse.json(
      { status: "invalid", message: "请先写下需要核实的交易理由" },
      { status: 400 },
    );
  }
  const relevantTerms = CLAIM_TERMS.filter((term) => reason.includes(term)).sort();
  const cacheKey = `evidence:v2:${code}:${relevantTerms.join("|") || "general"}`;
  const recent = readCached<Record<string, unknown>>(cacheKey, 5 * 60 * 1000);
  if (recent) {
    return NextResponse.json({
      ...recent.value,
      cache_hit: true,
      cached_at: recent.cachedAt,
      feed: { ...((recent.value.feed as Record<string, unknown> | undefined) ?? {}), data_mode: "cached", cached_at: recent.cachedAt, message: "使用最近 5 分钟内成功取得的公开资料。" },
    }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300", "server-timing": "evidence;desc=recent-cache" } });
  }

  const baseUrl = (process.env.ANXIN_API_URL || DEFAULT_ANXIN_API_URL).replace(/\/$/, "");
  const url = `${baseUrl}/stocks/${code}/evidence?limit=10&reason=${encodeURIComponent(reason)}`;
  try {
    if (!process.env.ANXIN_API_URL) throw new Error("FastAPI not configured");
    const payload = withEvidenceReliability(await requestJson(url, 45_000) as Record<string,unknown>,"安心看股资料服务");
    storeCached(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    try {
      const result = await Promise.any([
        cninfoAnnouncementEvidence(code, reason).then((payload) => ({ payload, source: "巨潮资讯 · 法定披露平台", fallback: "安心看股资料服务" })),
        publicAnnouncementEvidence(code, reason).then((payload) => ({ payload, source: "东方财富公告聚合", fallback: "巨潮资讯" })),
      ]);
      const payload = withEvidenceReliability(result.payload, result.source, result.fallback);
      storeCached(cacheKey, payload);
      return NextResponse.json(payload, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600", "server-timing": `evidence;desc=${result.source.includes("巨潮") ? "cninfo" : "eastmoney"}` } });
    } catch {
        const cached = readCached<Record<string, unknown>>(cacheKey, 24 * 60 * 60 * 1000);
        if (cached) return NextResponse.json({ ...cached.value, freshness_status:"stale",feed: { ...((cached.value.feed as Record<string, unknown> | undefined) ?? {}), data_mode: "cached", cached_at: cached.cachedAt, message: "公开资料源暂不可用，当前显示最近一次成功检索结果。" },reliability:reliability({status:"stale",last_success_at:cached.cachedAt,data_timestamp:String(cached.value.updated_at??cached.cachedAt),error_code:"EVIDENCE_SOURCE_FAILED",message:"缓存资料不能支持新的实时结论",retryable:true,fallback_used:"内存缓存",allow_signal:false}) });
        return NextResponse.json(
          {
            status: "unavailable",
            message: "公开资料检索暂时不可用。你的原始理由已保留，请稍后重试。",
            diagnostics: error instanceof Error ? error.message : "evidence unavailable",
            reliability:reliability({status:"unavailable",error_code:"EVIDENCE_UNAVAILABLE",message:"公开资料检索不可用",retryable:true,allow_signal:false}),
          },
          { status: 503 },
        );
    }
  }
}
