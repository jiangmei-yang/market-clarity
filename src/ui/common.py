from __future__ import annotations

import os
import hmac
from pathlib import Path
from datetime import date

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

from src.analytics.indicators import add_indicators
from src.database import Database
from src.integrations import discover_dsa_url
from src.ui.i18n import language_switcher, tr

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@st.cache_data(ttl=10, show_spinner=False)
def get_dsa_web_url(configured_url: str = "") -> str | None:
    return discover_dsa_url(configured_url or None)


@st.cache_data(ttl=10, show_spinner=False)
def get_dsa_preview_url(configured_url: str = "") -> str | None:
    return discover_dsa_url(configured_url or None, require_ready=False)


def secret_value(key: str, default=None):
    """Read optional cloud configuration without exposing it to the client."""
    try:
        return st.secrets.get(key, default)
    except (FileNotFoundError, KeyError):
        return default


def require_family_password():
    expected = secret_value("APP_PASSWORD")
    if not expected:
        return
    if st.session_state.get("access_authenticated") or st.session_state.get("family_authenticated"):
        return
    st.title("🛡️ 安心看股")
    st.write("请输入访问密码后继续。密码仅在服务器端校验，不会放入网址。")
    with st.form("access_login"):
        entered = st.text_input("访问密码", type="password", autocomplete="current-password")
        submitted = st.form_submit_button("进入应用", type="primary")
    if submitted:
        if hmac.compare_digest(str(entered), str(expected)):
            st.session_state["access_authenticated"] = True
            st.rerun()
        else:
            st.error("密码不正确，请重新输入。")
    st.stop()


def init_page(title: str, icon: str = "📊"):
    st.set_page_config(page_title=f"{title}｜安心看股", page_icon=icon, layout="wide", initial_sidebar_state="expanded")
    require_family_password()
    db = get_db()
    font_size = db.get_setting("font_size", 18)
    st.markdown(f"""<style>
    html, body, [class*="css"] {{font-size:{font_size}px}}
    [data-testid="stAppViewContainer"] {{background:radial-gradient(circle at 80% -10%,rgba(71,167,255,.16) 0,transparent 30%),linear-gradient(180deg,#f8fbff 0%,#eef5fc 100%)}}
    [data-testid="stHeader"] {{background:rgba(248,251,255,.88);backdrop-filter:blur(16px)}}
    [data-testid="stToolbar"], [data-testid="stAppDeployButton"], #MainMenu {{display:none!important}}
    [data-testid="stSidebar"] {{background:linear-gradient(180deg,#f7fbff,#edf5fd);border-right:1px solid #d6e5f3}}
    .block-container {{max-width:1240px; padding-top:1.4rem; padding-bottom:2.5rem}}
    h1 {{font-size:2.2rem !important}} h2 {{font-size:1.55rem !important}}
    h1,h2,h3 {{letter-spacing:-.025em;color:#102a43}}
    [data-testid="stMetricValue"] {{font-size:2rem}}
    .notice {{padding:1rem;border-radius:.7rem;background:#eaf4ff;border-left:5px solid #328fe8;margin:.5rem 0}}
    .plain-card {{padding:1rem;border-radius:1rem;background:rgba(255,255,255,.86);border:1px solid #d7e6f3;margin:.55rem 0;line-height:1.65;box-shadow:0 10px 30px rgba(44,93,135,.08)}}
    .plain-card b {{font-size:1.08rem}}
    [data-testid="stSidebarNav"] {{display:none}}
    .step-line {{display:flex;gap:.45rem;flex-wrap:wrap;margin:.5rem 0 1.2rem}}
    .step-pill {{padding:.35rem .7rem;border-radius:999px;background:#e8f3ff;color:#32658f;font-size:.86rem;font-weight:700;border:1px solid #cae1f6}}
    .review-hero {{padding:1.2rem;border-radius:1rem;background:#fff;border:1px solid #d7e6f3;margin:.7rem 0}}
    .review-hero h2 {{margin:.1rem 0 .45rem}}
    .risk-high {{background:#fff4dc;border-left:5px solid #d7a53c;padding:.8rem;border-radius:.5rem}}
    .risk-medium {{background:#edf5ff;border-left:5px solid #4b93d8;padding:.8rem;border-radius:.5rem}}
    .risk-low {{background:#f2f6fa;border-left:5px solid #91a9bd;padding:.8rem;border-radius:.5rem}}
    .hero-shell {{position:relative;overflow:hidden;padding:1.75rem 1.8rem;border-radius:1.35rem;background:linear-gradient(135deg,#ffffff 0%,#eaf5ff 64%,#d9edff 100%);color:#17324d;border:1px solid #cfe3f5;box-shadow:0 18px 45px rgba(61,112,157,.12);margin-bottom:1rem}}
    .hero-shell:after {{content:"";position:absolute;width:260px;height:260px;border-radius:50%;right:-70px;top:-120px;background:radial-gradient(circle,rgba(224,177,77,.25),transparent 68%)}}
    .hero-shell h1,.hero-shell h2,.hero-shell h3 {{color:#102a43!important;margin:.25rem 0 .55rem}}
    .hero-shell p {{max-width:720px;color:#547088;line-height:1.7;margin:.25rem 0}}
    .home-hero {{padding:2.15rem 2.25rem;background:linear-gradient(118deg,#ffffff 0%,#eaf5ff 62%,#fff7df 118%)}}
    .home-hero h1 {{font-size:2.55rem!important;max-width:820px}}
    .eyebrow {{font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2d83d5}}
    .hero-tags {{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:1rem}}
    .hero-tag {{padding:.34rem .62rem;border-radius:999px;border:1px solid #c7ddf1;background:rgba(255,255,255,.7);color:#356888;font-size:.78rem;font-weight:700}}
    .section-kicker {{font-size:.78rem;color:#367fbd;font-weight:800;letter-spacing:.09em;text-transform:uppercase;margin-top:1.35rem}}
    .section-heading {{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin:1.45rem 0 .75rem}}
    .section-heading span {{display:block;font-size:.72rem;color:#367fbd;font-weight:850;letter-spacing:.11em;text-transform:uppercase;margin-bottom:.18rem}}
    .section-heading h2 {{font-size:1.35rem!important;margin:0!important}}
    .section-heading>small {{color:#7a91a5;padding-bottom:.2rem}}
    .market-card {{position:relative;padding:1rem 1.05rem;border-radius:1rem;background:rgba(255,255,255,.9);border:1px solid #d7e6f3;box-shadow:0 8px 25px rgba(48,95,137,.07)}}
    .market-card>span {{display:block;color:#6f879b;font-size:.8rem;font-weight:750}}
    .market-card>b {{display:inline-block;color:#17324c;font-size:1.38rem;margin-top:.2rem}}
    .market-card>em {{float:right;margin-top:.4rem;font-size:.9rem;font-style:normal}}
    .core-feature {{position:relative;overflow:hidden;min-height:246px;padding:1.45rem 1.5rem;border-radius:1.15rem;background:#fff;border:1px solid #d5e6f4;box-shadow:0 13px 34px rgba(47,95,137,.09);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}}
    .core-feature:hover {{transform:translateY(-3px);border-color:#9fcdf3;box-shadow:0 18px 42px rgba(47,112,169,.14)}}
    .core-feature.information {{background:linear-gradient(145deg,#fff,#eaf6ff)}}
    .core-feature.decision {{background:linear-gradient(145deg,#fff,#fff8e6)}}
    .core-feature:after {{content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-70px;top:-75px;background:rgba(84,176,245,.09)}}
    .core-feature.decision:after {{background:rgba(220,171,69,.12)}}
    .core-feature>span {{display:block;color:#4e84ad;font-size:.7rem;font-weight:850;letter-spacing:.12em;margin-bottom:.5rem}}
    .core-feature h2 {{font-size:1.75rem!important;margin:.15rem 0 .5rem!important}}
    .core-feature p {{max-width:520px;color:#607c92;line-height:1.65;margin:0 0 1rem}}
    .core-icon {{position:absolute;right:1.25rem;top:1.15rem;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#e3f3ff;color:#287dc2;font-size:1.35rem;font-weight:850}}
    .decision .core-icon {{background:#fff0c9;color:#9c6d12}}
    .feature-points {{display:flex;gap:.42rem;flex-wrap:wrap}}
    .feature-points i {{font-style:normal;padding:.3rem .55rem;border-radius:999px;background:rgba(255,255,255,.78);border:1px solid #d4e4f0;color:#55748c;font-size:.75rem;font-weight:720}}
    .personal-heading {{margin-top:1.8rem}}
    .overview-card {{min-height:132px;padding:1.05rem 1.1rem;border-radius:1rem;background:#fff;border:1px solid #d7e6f3;box-shadow:0 8px 25px rgba(48,95,137,.07)}}
    .overview-card>span {{display:block;color:#69849a;font-size:.7rem;font-weight:850;letter-spacing:.09em;margin-bottom:.55rem}}
    .overview-card>b {{display:block;color:#17324c;font-size:1.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .overview-card>small {{display:block;color:#7890a4;margin-top:.4rem;line-height:1.45}}
    .quiet-note {{display:flex;align-items:center;gap:.7rem;margin-top:1.5rem;padding:.8rem 1rem;border-top:1px solid #d9e6f1;color:#7890a4;font-size:.78rem}}
    .quiet-note b {{color:#4f718c}}
    .dashboard-hero {{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(250px,.72fr);gap:2.2rem;align-items:center;padding:2.25rem 2.35rem 3.8rem;border-radius:1.45rem;background:radial-gradient(circle at 78% 8%,rgba(87,185,255,.3),transparent 29%),radial-gradient(circle at 12% 115%,rgba(217,170,67,.2),transparent 34%),linear-gradient(125deg,#0b1d33 0%,#123a61 61%,#0d2743 100%);box-shadow:0 24px 60px rgba(18,52,83,.24);color:#fff}}
    .dashboard-hero:before {{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(138,203,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(138,203,255,.045) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(90deg,#000,transparent 76%);pointer-events:none}}
    .hero-copy,.hero-console {{position:relative;z-index:1}}
    .hero-topline {{font-size:.72rem;font-weight:850;letter-spacing:.12em;color:#8fcfff;margin-bottom:1rem}}
    .live-dot {{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:.5rem;background:#e4b74f;box-shadow:0 0 0 5px rgba(228,183,79,.12)}}
    .dashboard-hero h1 {{font-size:2.75rem!important;line-height:1.16;color:#fff!important;margin:0 0 .85rem!important;letter-spacing:-.04em}}
    .dashboard-hero .hero-copy>p {{max-width:720px;color:#bdd3e5;font-size:1.02rem;line-height:1.75;margin:0}}
    .hero-capabilities {{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1.2rem}}
    .hero-capabilities span {{padding:.38rem .58rem;border-radius:.45rem;border:1px solid rgba(159,211,249,.22);background:rgba(255,255,255,.055);color:#d8e9f6;font-size:.7rem;font-weight:760;letter-spacing:.04em}}
    .hero-console {{display:flex;flex-direction:column;align-items:center;text-align:center;padding:1.05rem .95rem;border:1px solid rgba(167,216,251,.2);border-radius:1.05rem;background:rgba(7,23,41,.38);box-shadow:inset 0 1px rgba(255,255,255,.08);backdrop-filter:blur(10px)}}
    .console-label {{font-size:.68rem;letter-spacing:.12em;color:#8fc8f2;font-weight:800}}
    .console-orb {{width:104px;height:104px;border-radius:50%;display:grid;place-items:center;margin:.75rem 0;background:conic-gradient(#e1b14c 0 16%,#4db2f5 16% 68%,rgba(155,200,233,.15) 68%);box-shadow:0 0 34px rgba(65,166,235,.2);position:relative}}
    .console-orb:after {{content:"";position:absolute;inset:8px;border-radius:50%;background:#102b48}}
    .console-orb>div {{position:relative;z-index:1}}
    .console-orb strong {{display:block;font-size:2rem;line-height:1;color:#fff}}
    .console-orb small {{display:block;font-size:.55rem;letter-spacing:.08em;color:#8fc8f2;margin-top:.2rem}}
    .hero-console>b {{color:#fff;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .hero-console>p {{font-size:.69rem;line-height:1.45;color:#8daac0;margin:.35rem 0 0}}
    .workspace-header {{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(0,2fr);gap:1rem;align-items:stretch;padding:1rem;border:1px solid #d2e3ef;border-radius:1.1rem;background:linear-gradient(115deg,#fafdff,#eef7ff);box-shadow:0 12px 34px rgba(39,87,128,.09)}}
    .workspace-title {{display:flex;flex-direction:column;justify-content:center;padding:.35rem .65rem;border-right:1px solid #d5e4ef}}
    .workspace-title>span {{font-size:.68rem;font-weight:850;letter-spacing:.08em;color:#ba8421}}
    .workspace-title>b {{font-size:1.35rem;color:#16334d;margin:.12rem 0}}
    .workspace-title>small {{font-size:.68rem;color:#7890a3}}
    .workspace-status {{display:grid;grid-template-columns:1.3fr .8fr .9fr;gap:.55rem}}
    .workspace-status>a {{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:.65rem .8rem;border-radius:.8rem;text-decoration:none!important;background:rgba(255,255,255,.75);border:1px solid #dbe8f1;transition:border-color .18s ease,background .18s ease}}
    .workspace-status>a:hover {{border-color:#92c7ed;background:#fff}}
    .workspace-status span {{font-size:.6rem;font-weight:850;letter-spacing:.08em;color:#6d879a}}
    .workspace-status b {{font-size:.98rem;color:#17324b;margin:.12rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .workspace-status small {{font-size:.66rem;color:#7a91a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .pending-line {{display:flex;align-items:center;gap:.7rem;padding:.65rem .9rem;margin:.55rem 0;border-radius:.75rem;background:#fff9e9;border:1px solid #eadcb9}}
    .pending-line>span {{font-size:.62rem;font-weight:850;letter-spacing:.08em;color:#9b6e17}}
    .pending-line>p {{margin:0;color:#765f34;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .home-topbar {{display:flex;align-items:center;justify-content:space-between;padding:.2rem .2rem .8rem;color:#6d879b}}
    .home-topbar>div {{display:flex;align-items:center;gap:.65rem}}
    .home-topbar span {{font-size:.72rem;font-weight:800;color:#b27b16}}
    .home-topbar b {{font-size:1rem;color:#17324c}}
    .home-topbar small {{font-size:.68rem}}
    .home-intent {{padding:1.45rem 1.55rem .9rem;border:1px solid #d2e4f2;border-bottom:0;border-radius:1.15rem 1.15rem 0 0;background:radial-gradient(circle at 90% 0,rgba(224,176,73,.17),transparent 35%),linear-gradient(125deg,#fff,#eaf6ff)}}
    .home-intent>span {{font-size:.65rem;font-weight:850;letter-spacing:.12em;color:#b27b16}}
    .home-intent h1 {{font-size:1.75rem!important;margin:.3rem 0 .2rem!important}}
    .home-intent p {{color:#698298;margin:0;font-size:.84rem}}
    .st-key-home_primary_actions {{padding:.25rem 1.15rem .95rem;border:1px solid #d2e4f2;border-top:0;border-radius:0 0 1.15rem 1.15rem;background:linear-gradient(125deg,#fff,#eef7ff);box-shadow:0 14px 34px rgba(39,87,128,.09)}}
    .st-key-home_primary_actions button {{min-height:54px!important;font-size:1rem!important}}
    .st-key-home_research_bar {{margin:.7rem 0;padding:.75rem .85rem .05rem;border:1px solid #d7e5ef;border-radius:.9rem;background:rgba(255,255,255,.82)}}
    .st-key-home_research_bar [data-baseweb="input"]>div,.st-key-home_research_bar button {{min-height:46px}}
    .home-attention {{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.85rem;align-items:center;padding:.8rem 1rem;border:1px solid #eadcb9;border-radius:.85rem;background:#fff9e9}}
    .home-attention>span {{font-size:.62rem;font-weight:850;letter-spacing:.09em;color:#9b6e17}}
    .home-attention b {{display:block;color:#4e4430;font-size:.86rem}}
    .home-attention p {{margin:.08rem 0 0;color:#806d48;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .home-attention>a {{text-decoration:none!important;color:#936816;font-size:.72rem;font-weight:800;white-space:nowrap}}
    .home-overview {{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin:.7rem 0 1rem}}
    .home-overview>a {{display:flex;flex-direction:column;padding:.85rem 1rem;border:1px solid #d7e5ef;border-radius:.9rem;background:#fff;text-decoration:none!important;box-shadow:0 7px 22px rgba(43,91,132,.06)}}
    .home-overview span {{font-size:.61rem;font-weight:850;letter-spacing:.08em;color:#6e899d}}
    .home-overview b {{font-size:1.05rem;color:#17324b;margin:.16rem 0}}
    .home-overview small {{font-size:.68rem;color:#7890a3}}
    .st-key-home_command_center {{position:relative;z-index:3;margin:.55rem 0 .7rem;padding:.8rem .9rem .1rem;border:1px solid #d2e4f2;border-radius:.95rem;background:rgba(255,255,255,.96);box-shadow:0 10px 28px rgba(25,75,117,.1);backdrop-filter:blur(16px)}}
    .st-key-home_command_center [data-baseweb="input"]>div {{min-height:48px;background:#f5f9fd!important;border-color:#ccdeec!important}}
    .st-key-home_command_center button {{min-height:48px!important}}
    .market-ticker {{display:grid;grid-template-columns:1.15fr repeat(3,1fr);align-items:center;margin:.75rem 0 1.5rem;padding:.65rem .85rem;border:1px solid #d5e5f2;border-radius:.9rem;background:rgba(255,255,255,.76);box-shadow:0 7px 22px rgba(43,91,132,.06)}}
    .ticker-title {{padding:.2rem .6rem;border-right:1px solid #dae7f1}}
    .ticker-title>span {{display:block;font-size:.68rem;font-weight:850;letter-spacing:.1em;color:#317fbf}}
    .ticker-title>small {{color:#8498a9;font-size:.66rem}}
    .ticker-item {{display:grid;grid-template-columns:1fr auto;gap:.08rem .5rem;padding:.15rem .8rem;border-right:1px solid #e0eaf2}}
    .ticker-item:last-child {{border-right:0}}
    .ticker-item>span {{grid-column:1/3;font-size:.68rem;color:#6f879a}}
    .ticker-item>b {{font-size:.98rem;color:#17324b}}
    .ticker-item>em {{font-size:.74rem;font-style:normal;align-self:center}}
    .bento-heading {{margin:.55rem 0 .75rem}}
    .bento-heading>span {{font-size:.68rem;color:#ba8421;font-weight:850;letter-spacing:.12em}}
    .bento-heading>h2 {{font-size:1.45rem!important;margin:.18rem 0 0!important}}
    .bento-grid {{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.8rem}}
    .bento-card {{position:relative;overflow:hidden;display:block;text-decoration:none!important;color:inherit!important;border:1px solid #d3e3ef;border-radius:1.15rem;background:#fff;box-shadow:0 10px 30px rgba(40,88,128,.08);transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}}
    .bento-card:hover {{transform:translateY(-4px);border-color:#8ec6ef;box-shadow:0 18px 42px rgba(37,95,145,.15)}}
    .research-bento {{grid-column:span 4;min-height:315px;padding:1.35rem 1.45rem;background:radial-gradient(circle at 92% 0,rgba(72,172,246,.17),transparent 38%),linear-gradient(145deg,#fff,#edf7ff)}}
    .decision-bento {{grid-column:span 2;min-height:315px;padding:1.35rem 1.4rem;background:radial-gradient(circle at 100% 0,rgba(224,176,73,.19),transparent 42%),linear-gradient(145deg,#fff,#fffbef)}}
    .bento-top {{display:flex;align-items:center;gap:.55rem}}
    .bento-top>i {{font-style:normal;color:#648199;font-size:.67rem;font-weight:850;letter-spacing:.1em}}
    .bento-top>strong {{margin-left:auto;color:#5986a5;font-size:1.15rem}}
    .bento-index {{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#dff1ff;color:#267ebf;font-size:.72rem;font-weight:850}}
    .bento-index.gold {{background:#fff0c9;color:#98680f}}
    .bento-title {{font-size:1.7rem;font-weight:850;letter-spacing:-.025em;color:#17324c;margin:1rem 0 .45rem}}
    .bento-card>p {{max-width:560px;color:#698197;line-height:1.55;margin:0}}
    .research-visual {{position:absolute;left:1.45rem;right:1.45rem;bottom:3.25rem;height:100px}}
    .research-visual svg {{width:100%;height:70px;overflow:visible}}
    .research-visual .area {{fill:url(#area)}} .research-visual .line {{fill:none;stroke:#3a9fe8;stroke-width:2.2}}
    .research-visual>div {{display:flex;gap:.45rem}}
    .research-visual span {{font-size:.65rem;color:#547b98;padding:.22rem .42rem;border-radius:999px;background:rgba(255,255,255,.8);border:1px solid #d1e4f2}}
    .decision-signals {{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin:1.35rem 0}}
    .decision-signals>div {{padding:.6rem .4rem;text-align:center;border-radius:.7rem;background:rgba(255,255,255,.74);border:1px solid #e7dcc0}}
    .decision-signals span {{display:block;font-size:.56rem;color:#8a7752;letter-spacing:.06em}}
    .decision-signals b {{display:block;font-size:1.05rem;color:#b27d17;margin-top:.18rem}}
    .bento-cta {{position:absolute;left:1.45rem;right:1.45rem;bottom:1.1rem;padding-top:.7rem;border-top:1px solid #d8e7f2;color:#287fc0;font-size:.76rem;font-weight:800}}
    .bento-cta>span {{float:right;font-size:1rem}} .bento-cta.gold-text {{color:#9b6d16;border-top-color:#eadfca}}
    .compact-bento {{grid-column:span 2;min-height:150px;padding:1.05rem 1.1rem}}
    .compact-bento>span {{display:block;color:#6f899c;font-size:.62rem;font-weight:850;letter-spacing:.09em;margin-top:.7rem}}
    .compact-title {{font-size:1.12rem;font-weight:820;color:#17324c;margin:.25rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .compact-bento>p {{font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .compact-icon {{position:absolute;right:1rem;top:1rem;width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#e4f3ff;color:#2b81c0}}
    .compact-icon.gold-icon {{background:#fff1ce;color:#9b6c13}}
    .quick-action-label {{margin:1.15rem 0 .45rem;color:#668399;font-size:.68rem;font-weight:850;letter-spacing:.1em}}
    .decision-result-card {{overflow:hidden;margin:.6rem 0 1rem;border:1px solid #cfe1ef;border-radius:1.2rem;background:#fff;box-shadow:0 18px 45px rgba(35,82,122,.12)}}
    .decision-result-head {{display:flex;align-items:center;justify-content:space-between;gap:1.2rem;padding:1.25rem 1.35rem;background:radial-gradient(circle at 92% 0,rgba(223,173,67,.18),transparent 38%),linear-gradient(120deg,#f9fcff,#eaf5ff)}}
    .decision-result-head>div>span {{font-size:.65rem;font-weight:850;letter-spacing:.1em;color:#aa7619}}
    .decision-result-head h2 {{font-size:1.55rem!important;margin:.25rem 0 .12rem!important}}
    .decision-result-head p {{margin:0;color:#6a8296;font-size:.76rem}}
    .decision-plan {{min-width:190px;padding:.7rem .85rem;border-left:1px solid #d3e4f1}}
    .decision-plan small,.decision-plan b,.decision-plan strong {{display:block}}
    .decision-plan small {{font-size:.62rem;color:#7890a3}}
    .decision-plan b {{font-size:.9rem;color:#27465f;margin:.12rem 0}}
    .decision-plan strong {{font-size:1.2rem;color:#a87315}}
    .impact-grid {{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #dce8f2;border-bottom:1px solid #dce8f2}}
    .impact-grid>div {{padding:.9rem 1rem;border-right:1px solid #e0eaf2}}
    .impact-grid>div:last-child {{border-right:0}}
    .impact-grid span,.impact-grid b,.impact-grid small {{display:block}}
    .impact-grid span {{font-size:.62rem;font-weight:800;letter-spacing:.05em;color:#72899c}}
    .impact-grid b {{font-size:1.08rem;color:#17324b;margin:.2rem 0}}
    .impact-grid small {{font-size:.66rem;color:#8397a7}}
    .impact-grid .gold {{background:#fffbef}}
    .impact-grid .gold b {{color:#9e6e16}}
    .review-two-column {{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;padding:1rem 1.15rem}}
    .review-section {{padding:.85rem .9rem;border:1px solid #dce7ef;border-radius:.9rem;background:#fbfdff}}
    .review-section-title {{display:flex;align-items:center;gap:.45rem;margin-bottom:.45rem}}
    .review-section-title span {{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#e2f2ff;color:#287cb9;font-size:.62rem;font-weight:850}}
    .review-section-title b {{font-size:.83rem;color:#29475f}}
    .review-check-item {{display:flex;align-items:flex-start;gap:.55rem;padding:.5rem 0;border-top:1px solid #e5edf3}}
    .review-check-item>i {{display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:#fff1cd;color:#9b6c14;font-style:normal;font-size:.7rem;font-weight:900}}
    .review-check-item b,.review-check-item span {{display:block}}
    .review-check-item b {{font-size:.78rem;color:#29465d}}
    .review-check-item span {{font-size:.68rem;color:#7890a2;margin-top:.08rem}}
    .claim-line {{display:grid;grid-template-columns:92px 1fr;gap:.5rem;padding:.48rem 0;border-top:1px solid #e5edf3}}
    .claim-line>span {{font-size:.62rem;font-weight:800;color:#9a6c18}}
    .claim-line>b {{font-size:.76rem;color:#405d72;font-weight:700}}
    .claim-line.observable_fact>span {{color:#2c7eb9}}
    .review-empty-line {{padding:.7rem 0;color:#7890a2;font-size:.74rem}}
    .decision-boundary {{padding:.7rem 1.2rem;border-top:1px solid #e0eaf2;background:#f7fafc;color:#7890a2;font-size:.68rem}}
    .evidence-row {{display:flex;gap:.7rem;padding:.8rem .2rem;border-bottom:1px solid #dfeaf2}}
    .evidence-row>span {{color:#ae7919}}
    .evidence-row b {{font-size:.84rem;color:#29465d}}
    .evidence-row p {{margin:.2rem 0;color:#617c91;font-size:.77rem;line-height:1.55}}
    .evidence-row small {{font-size:.65rem;color:#879baa}}
    .choice-heading {{display:flex;justify-content:space-between;align-items:end;margin:1.1rem 0 .45rem}}
    .choice-heading>span {{font-size:1.05rem;font-weight:850;color:#17324b}}
    .choice-heading>b {{font-size:.68rem;color:#7d91a1;font-weight:650}}
    .comparison-card {{margin:1rem 0;border:1px solid #d5e4ef;border-radius:1rem;background:#fff;overflow:hidden;box-shadow:0 10px 28px rgba(42,89,128,.08)}}
    .comparison-head {{display:flex;justify-content:space-between;padding:.8rem 1rem;background:linear-gradient(90deg,#edf7ff,#fff9e8)}}
    .comparison-head span {{font-weight:850;color:#17324b}} .comparison-head b {{font-size:.7rem;color:#9c6c15}}
    .comparison-grid {{display:grid;grid-template-columns:1.3fr 1fr 1fr;padding:.65rem 1rem;border-top:1px solid #e2ebf2;font-size:.76rem;color:#6c8497}}
    .comparison-grid.header {{font-size:.62rem;font-weight:850;letter-spacing:.07em;color:#8095a6}}
    .comparison-grid>b {{color:#3e5d74}} .comparison-grid>strong {{color:#9b6d16}}
    .feature-card {{height:100%;padding:1.15rem;border-radius:1rem;background:rgba(255,255,255,.9);border:1px solid #d7e6f3;box-shadow:0 10px 30px rgba(51,99,141,.08);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}}
    .feature-card:hover {{transform:translateY(-3px);border-color:#9fcdf3;box-shadow:0 16px 36px rgba(47,112,169,.14)}}
    .feature-card.featured {{background:linear-gradient(145deg,#ffffff,#edf7ff);border-color:#bcdcf5}}
    .feature-card .index {{display:inline-flex;width:30px;height:30px;border-radius:9px;align-items:center;justify-content:center;background:#fff3d3;color:#9b6b12;font-weight:850;margin-bottom:.65rem}}
    .feature-card b {{display:block;color:#18344e;font-size:1.04rem;margin-bottom:.28rem}}
    .feature-card small {{color:#688198;line-height:1.55}}
    .cockpit {{padding:1.25rem;border-radius:1.15rem;background:linear-gradient(135deg,#ffffff,#e8f4ff);color:#19334d;border:1px solid #cfe2f2;box-shadow:0 14px 34px rgba(51,96,136,.1)}}
    .cockpit .label {{color:#648099;font-size:.78rem;font-weight:700;letter-spacing:.04em}}
    .cockpit .big {{font-size:2.1rem;font-weight:850;color:#102a43;line-height:1.15;margin:.2rem 0}}
    .cockpit .accent {{color:#b68728}}
    .signal-grid {{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem;margin:.65rem 0}}
    .signal-card {{padding:.9rem;border-radius:.9rem;background:#fff;border:1px solid #d7e6f3;box-shadow:0 7px 22px rgba(48,95,137,.08)}}
    .signal-card.watch {{border-left:4px solid #e0a12b}}
    .signal-card.calm {{border-left:4px solid #4b93d8}}
    .signal-title {{font-size:.8rem;color:#6d879d;font-weight:700}}
    .signal-value {{font-size:1.4rem;color:#17324c;font-weight:850;margin:.1rem 0 .25rem}}
    .signal-note {{font-size:.82rem;color:#60788e;line-height:1.5}}
    .signal-limit {{font-size:.75rem;color:#8a6c31;margin-top:.35rem;line-height:1.45}}
    .history-row {{padding:.85rem .95rem;border-radius:.85rem;background:#fff;border:1px solid #d7e6f3;margin:.45rem 0}}
    .history-row b {{color:#17324c}} .history-row small {{color:#72899d}}
    .research-header {{padding:1.35rem 1.45rem;border-radius:1.1rem;background:linear-gradient(135deg,#ffffff,#e9f5ff);color:#17324c;border:1px solid #cfe3f5;box-shadow:0 14px 36px rgba(46,95,137,.1)}}
    .research-header .stock-line {{display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap}}
    .research-header .stock-name {{font-size:2rem;font-weight:880;color:#102a43}}
    .research-header .stock-code {{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#246eac;background:#dceeff;padding:.2rem .45rem;border-radius:.4rem}}
    .research-header .price {{font-size:1.7rem;font-weight:820;color:#102a43}}
    .research-header .up {{color:#ff7272}} .research-header .down {{color:#42d6a4}}
    .research-summary {{font-size:1rem;line-height:1.75;color:#506d85;margin-top:1rem;max-width:800px}}
    .tag-row {{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem}}
    .data-tag {{display:inline-block;padding:.27rem .52rem;border-radius:999px;background:#edf6ff;border:1px solid #c7dff3;color:#2e6f9f;font-size:.76rem;font-weight:700}}
    .temperature-card {{min-height:220px;padding:1.2rem;border-radius:1.1rem;background:#fff;border:1px solid #cfe3f5;color:#17324c;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 14px 36px rgba(46,95,137,.1)}}
    .temperature-ring {{--score:50;width:145px;height:145px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#e1b34f calc(var(--score)*1%),#dceaf6 0);position:relative}}
    .temperature-ring:after {{content:"";position:absolute;inset:12px;border-radius:50%;background:#fff}}
    .temperature-ring .inside {{position:relative;z-index:1;text-align:center}}
    .temperature-ring .score {{font-size:2.2rem;font-weight:880;line-height:1;color:#17324c}}
    .temperature-ring .state {{font-size:.82rem;color:#9a6c18;margin-top:.3rem;font-weight:750}}
    .temperature-label {{font-size:.78rem;color:#70889d;margin-bottom:.8rem;letter-spacing:.06em}}
    .research-panel {{padding:1.05rem;border-radius:1rem;background:#fff;border:1px solid #d7e6f3;box-shadow:0 8px 28px rgba(48,95,137,.08);height:100%}}
    .research-panel .panel-title {{font-size:.8rem;color:#69808f;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:.65rem}}
    .insight-item {{padding:.72rem 0;border-bottom:1px solid #e0eaf3}}
    .insight-item:last-child {{border-bottom:0}}
    .insight-item b {{color:#17324c}} .insight-item small {{display:block;color:#72899d;margin-top:.18rem;line-height:1.45}}
    .level-grid {{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.6rem}}
    .level-card {{padding:.85rem;border-radius:.85rem;background:#fff;border:1px solid #d7e6f3;color:#17324c}}
    .level-card .name {{font-size:.75rem;color:#7fa3b2}}
    .level-card .number {{font-size:1.25rem;font-weight:840;margin:.2rem 0;color:#b07c1e}}
    .level-card .meaning {{font-size:.72rem;color:#91aab4;line-height:1.35}}
    .compact-history {{padding:.85rem;border-radius:.9rem;background:#fff;border:1px solid #d7e6f3;margin-bottom:.55rem}}
    .compact-history.active {{border-color:#4a9be7;box-shadow:0 0 0 2px rgba(74,155,231,.1)}}
    .compact-history .name {{font-weight:800;color:#17324c}}
    .compact-history .meta {{font-size:.74rem;color:#7c8f9b;margin-top:.25rem}}
    .compact-history .status {{display:inline-block;font-size:.7rem;font-weight:750;color:#8b641d;background:#fff2ce;border-radius:999px;padding:.18rem .4rem;float:right}}
    .integration-title {{padding:.3rem .35rem}}
    .integration-title span {{display:block;font-size:.68rem;letter-spacing:.12em;color:#b17d21;font-weight:850;margin-bottom:.18rem}}
    .integration-title b {{display:block;font-size:1.35rem;color:#15334e;line-height:1.2}}
    .integration-title small {{display:block;color:#70899e;margin-top:.24rem}}
    .integration-frame-label {{margin-top:.8rem;padding:.55rem .85rem;border:1px solid #d2e4f3;border-bottom:0;border-radius:1rem 1rem 0 0;background:linear-gradient(90deg,#eaf5ff,#fff7df);color:#49718f;font-size:.7rem;font-weight:850;letter-spacing:.11em}}
    [data-testid="stIFrame"] {{display:block;border:1px solid #d2e4f3;border-radius:0 0 1rem 1rem;overflow:hidden;background:#0a0f1e;box-shadow:0 18px 45px rgba(43,88,128,.14)}}
    .empty-state {{text-align:center;padding:4.5rem 1.5rem;border:1px dashed #bcd5e9;border-radius:1.2rem;background:rgba(255,255,255,.7);margin:1rem 0}}
    .empty-state>span {{display:inline-grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#e5f3ff;color:#2f83d4;font-size:1.5rem}}
    .empty-state h3 {{margin:.9rem 0 .35rem}} .empty-state p {{color:#6c8499}}
    .phase-table {{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #d7e6f3;border-radius:.85rem;background:#fff}}
    .phase-table th {{text-align:left;background:#eaf3fb;color:#58738a;font-size:.78rem;padding:.65rem}}
    .phase-table td {{padding:.7rem .65rem;border-top:1px solid #e0eaf3;color:#3f5d74;font-size:.86rem}}
    .positive {{color:#d34d55!important;font-weight:750}} .negative {{color:#168c70!important;font-weight:750}}
    div[data-testid="stButton"] button[kind="primary"] {{background:linear-gradient(135deg,#58b8ff,#2f83e2);border:0;color:#fff;box-shadow:0 8px 20px rgba(47,131,226,.22)}}
    div[data-testid="stButton"] button, div[data-testid="stDownloadButton"] button {{border-radius:.75rem;border-color:#c9ddec;font-weight:700;background:#fff;color:#285779}}
    div[data-baseweb="input"]>div, div[data-baseweb="textarea"]>div, div[data-baseweb="select"]>div {{border-radius:.75rem!important;background:#fff!important;border-color:#c9ddec!important}}
    [data-testid="stMetric"] {{background:#fff;border:1px solid #d7e6f3;border-radius:1rem;padding:.85rem 1rem;box-shadow:0 7px 24px rgba(48,95,137,.08)}}
    [data-testid="stAlert"] {{border-radius:.85rem}}
    [data-testid="stAlertContainer"] {{background:#fff7e5!important;color:#6f5420!important;border:1px solid #ead59d!important;border-radius:.85rem!important}}
    .mobile-nav {{display:none}}
    @media(max-width:768px) {{
      [data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"] {{display:none !important}}
      .block-container {{padding:.75rem .85rem 6.2rem !important; max-width:100%}}
      h1 {{font-size:1.72rem !important; line-height:1.25}}
      h2,h3 {{font-size:1.28rem !important; line-height:1.35}}
      p,li,label {{line-height:1.6}}
      [data-testid="stMetric"] {{background:#fff;border:1px solid #d7e6f3;border-radius:.8rem;padding:.8rem}}
      [data-testid="stMetricValue"] {{font-size:1.55rem}}
      .stButton button, .stDownloadButton button, button[kind="primary"], button[kind="secondary"] {{min-height:48px !important;font-size:1rem !important;border-radius:.75rem !important}}
      [data-testid="stTextInput"] input, [data-testid="stNumberInput"] input {{min-height:48px;font-size:16px}}
      [data-testid="stHorizontalBlock"] {{flex-direction:column !important;gap:.5rem !important}}
      [data-testid="column"] {{width:100% !important;flex:1 1 auto !important}}
      [data-testid="stDataFrame"] {{max-width:100%;overflow-x:auto}}
      .mobile-nav {{display:flex;position:fixed;z-index:999999;left:0;right:0;bottom:0;height:68px;background:rgba(250,253,255,.96);border-top:1px solid #d5e4f1;box-shadow:0 -5px 20px rgba(52,95,132,.12);padding-bottom:env(safe-area-inset-bottom);align-items:center;justify-content:space-around;backdrop-filter:blur(16px)}}
      .mobile-nav a {{color:#56758e;text-decoration:none;font-size:.82rem;font-weight:700;text-align:center;min-width:58px;padding:.5rem .25rem;line-height:1.25}}
      .mobile-nav span {{display:block;font-size:1.25rem;margin-bottom:.08rem}}
      .desktop-only {{display:none !important}}
      .hero-shell {{padding:1.3rem 1.15rem;border-radius:1.05rem}}
      .hero-shell h1 {{font-size:1.65rem!important}}
      .home-hero {{padding:1.45rem 1.2rem}}
      .section-heading {{align-items:flex-start;margin-top:1.2rem}}
      .section-heading>small {{font-size:.7rem}}
      .market-card {{padding:.9rem 1rem}}
      .core-feature {{min-height:auto;padding:1.25rem}}
      .core-feature h2 {{font-size:1.45rem!important}}
      .overview-card {{min-height:auto}}
      .quiet-note {{align-items:flex-start;flex-direction:column;gap:.2rem}}
      .dashboard-hero {{grid-template-columns:1fr;padding:1.5rem 1.25rem 3rem;border-radius:1.15rem}}
      .dashboard-hero h1 {{font-size:1.95rem!important}}
      .dashboard-hero .hero-copy>p {{font-size:.9rem}}
      .hero-console {{display:none}}
      .hero-capabilities span {{font-size:.62rem}}
      .workspace-header {{grid-template-columns:1fr;padding:.75rem}}
      .workspace-title {{border-right:0;border-bottom:1px solid #d7e5ef;padding:.35rem .4rem .7rem}}
      .workspace-status {{grid-template-columns:1fr}}
      .workspace-status>a {{padding:.6rem .7rem}}
      .home-topbar {{padding:.1rem 0 .6rem}}
      .home-intent {{padding:1.1rem 1rem .65rem}}
      .home-intent h1 {{font-size:1.5rem!important}}
      .st-key-home_primary_actions {{padding:.15rem .75rem .7rem}}
      .st-key-home_primary_actions [data-testid="stHorizontalBlock"] {{display:grid!important;grid-template-columns:1fr 1fr!important;gap:.45rem!important}}
      .st-key-home_primary_actions [data-testid="column"] {{width:auto!important}}
      .st-key-home_research_bar {{padding:.65rem .7rem .05rem}}
      .home-attention {{grid-template-columns:1fr auto;gap:.35rem .6rem}}
      .home-attention>span {{grid-column:1/3}}
      .home-attention p {{white-space:normal;line-height:1.4}}
      .home-overview {{grid-template-columns:1fr}}
      .decision-result-head {{align-items:flex-start;flex-direction:column;padding:1rem}}
      .decision-plan {{width:100%;min-width:0;padding:.65rem 0 0;border-left:0;border-top:1px solid #d3e4f1}}
      .impact-grid {{grid-template-columns:1fr 1fr}}
      .impact-grid>div {{border-bottom:1px solid #e0eaf2}}
      .impact-grid>div:nth-child(2) {{border-right:0}}
      .review-two-column {{grid-template-columns:1fr;padding:.8rem}}
      .claim-line {{grid-template-columns:82px 1fr}}
      .choice-heading {{align-items:flex-start;flex-direction:column;gap:.15rem}}
      .comparison-grid {{grid-template-columns:1.1fr 1fr 1fr;padding:.6rem .7rem}}
      .pending-line {{align-items:flex-start}}
      .pending-line>p {{white-space:normal;line-height:1.45}}
      .st-key-home_command_center {{margin:.55rem 0;padding:.75rem .75rem .05rem}}
      .market-ticker {{grid-template-columns:1fr;padding:.5rem .7rem}}
      .ticker-title {{border-right:0;border-bottom:1px solid #dce8f1;padding:.35rem .25rem .5rem}}
      .ticker-item {{grid-template-columns:1fr auto auto;border-right:0;border-bottom:1px solid #e3ecf3;padding:.48rem .25rem}}
      .ticker-item:last-child {{border-bottom:0}}
      .ticker-item>span {{grid-column:auto}}
      .bento-grid {{grid-template-columns:1fr}}
      .research-bento,.decision-bento,.compact-bento {{grid-column:span 1}}
      .research-bento,.decision-bento {{min-height:300px}}
      .compact-bento {{min-height:125px}}
      .signal-grid {{grid-template-columns:1fr}}
      .cockpit .big {{font-size:1.72rem}}
      .research-header {{padding:1.1rem;border-radius:1rem}}
      .research-header .stock-name {{font-size:1.55rem}}
      .research-header .price {{font-size:1.35rem}}
      .temperature-card {{min-height:190px}}
      .level-grid {{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .integration-title {{text-align:center;padding:.25rem 0 .6rem}}
      [data-testid="stIFrame"] iframe {{min-height:900px}}
    }}
    </style>""", unsafe_allow_html=True)
    brand_name = tr("安心看股", "Anxin Stocks")
    brand_subtitle = tr("股票研究与决策", "Research & decisions")
    st.sidebar.markdown(f"""
    <div style="padding:.45rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.65rem">
        <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#63c2ff,#377fda);box-shadow:0 8px 18px rgba(55,127,218,.22);display:flex;align-items:center;justify-content:center;color:white;font-weight:900">安</div>
        <div><b style="font-size:1.12rem;color:#17324c">{brand_name}</b><br><small style="color:#728ba0">{brand_subtitle}</small></div>
      </div>
    </div>
    """, unsafe_allow_html=True)
    language_switcher()
    st.sidebar.page_link("app.py", label=tr("⌂ 开始", "⌂ Start"))
    st.sidebar.page_link("pages/1_📊_股票分析.py", label=tr("✦ 股票分析", "✦ Analysis"))
    st.sidebar.page_link("pages/3_💼_持仓.py", label=tr("▣ 我的持仓", "▣ Portfolio"))
    st.sidebar.page_link("pages/0_1_🧭_决策检查.py", label=tr("◇ 决策验证", "◇ Decision review"))
    st.sidebar.page_link("pages/0_3_📋_决策记录.py", label=tr("◷ 历史记录", "◷ History"))
    st.sidebar.page_link("pages/5_👤_我的.py", label=tr("◉ 我的", "◉ Me"))
    analysis_href = "/股票分析"
    mobile_home = tr("首页", "Home")
    mobile_analysis = tr("分析", "Analysis")
    mobile_portfolio = tr("持仓", "Portfolio")
    mobile_review = tr("验证", "Review")
    mobile_me = tr("我的", "Me")
    st.markdown(f"""
    <nav class="mobile-nav" aria-label="手机主导航">
      <a href="/" target="_self"><span>⌂</span>{mobile_home}</a>
      <a href="{analysis_href}" target="_self"><span>✦</span>{mobile_analysis}</a>
      <a href="/持仓" target="_self"><span>▣</span>{mobile_portfolio}</a>
      <a href="/1_🧭_决策检查" target="_self"><span>◇</span>{mobile_review}</a>
      <a href="/我的" target="_self"><span>◉</span>{mobile_me}</a>
    </nav>
    """, unsafe_allow_html=True)


@st.cache_resource
def get_db():
    configured = os.getenv("DATABASE_PATH")
    return Database(Path(configured) if configured else PROJECT_ROOT / "data" / "anshin.db")


def source_badge(result):
    if result.is_demo:
        st.warning(f"🧪 演示数据｜来源：{result.source}｜更新时间：{result.updated_at:%Y-%m-%d %H:%M}。演示价格并非真实行情。")
    else:
        st.info(f"数据来源：{result.source}｜更新时间：{result.updated_at:%Y-%m-%d %H:%M}")
    if result.message:
        st.caption(result.message)


def money(value, digits=2):
    if value is None or pd.isna(value): return "数据不足"
    value = float(value)
    if abs(value) >= 1e8: return f"{value / 1e8:,.{digits}f}亿元"
    if abs(value) >= 1e4: return f"{value / 1e4:,.{digits}f}万元"
    return f"{value:,.{digits}f}元"


def pct(value):
    return "数据不足" if value is None or pd.isna(value) else f"{float(value):+.2f}%"


def risk_icon(level):
    return {"较高": "◆ 较高", "一般": "◇ 一般", "较低": "○ 较低", "数据不足": "· 数据不足"}.get(level, f"· {level}")


def price_chart(frame: pd.DataFrame, show_rsi=True, show_macd=True, show_boll=False):
    data = add_indicators(frame)
    extra = int(show_rsi) + int(show_macd)
    rows = 2 + extra
    heights = [.55, .18] + ([.14] if show_rsi else []) + ([.14] if show_macd else [])
    fig = make_subplots(rows=rows, cols=1, shared_xaxes=True, vertical_spacing=.025, row_heights=heights)
    fig.add_trace(go.Candlestick(x=data.date, open=data.open, high=data.high, low=data.low, close=data.close, name="日K线"), row=1, col=1)
    for col, name, color in [("ma5", "MA5", "#ed8b00"), ("ma20", "MA20", "#2f80ed"), ("ma60", "MA60", "#8e44ad")]:
        fig.add_trace(go.Scatter(x=data.date, y=data[col], name=name, line=dict(width=1.4, color=color)), row=1, col=1)
    if show_boll:
        for col, name in [("boll_upper", "布林上轨"), ("boll_lower", "布林下轨")]:
            fig.add_trace(go.Scatter(x=data.date, y=data[col], name=name, line=dict(width=1, dash="dot")), row=1, col=1)
    colors = ["#d94b4b" if c >= o else "#2b8a6e" for o, c in zip(data.open, data.close)]
    fig.add_trace(go.Bar(x=data.date, y=data.volume, name="成交量", marker_color=colors), row=2, col=1)
    row = 3
    if show_rsi:
        fig.add_trace(go.Scatter(x=data.date, y=data.rsi, name="RSI", line=dict(color="#e67e22")), row=row, col=1)
        fig.add_hline(y=70, line_dash="dot", row=row, col=1); fig.add_hline(y=30, line_dash="dot", row=row, col=1)
        row += 1
    if show_macd:
        fig.add_trace(go.Bar(x=data.date, y=data.macd_hist, name="MACD柱"), row=row, col=1)
        fig.add_trace(go.Scatter(x=data.date, y=data.macd, name="MACD"), row=row, col=1)
        fig.add_trace(go.Scatter(x=data.date, y=data.macd_signal, name="信号线"), row=row, col=1)
    fig.update_layout(
        template="plotly_white", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(255,255,255,.7)",
        font=dict(color="#49677f"), height=760, xaxis_rangeslider_visible=False,
        hovermode="x unified", legend=dict(orientation="h"), margin=dict(l=10,r=10,t=35,b=10),
    )
    return fig


def disclaimer():
    st.divider()
    st.caption("风险等级依据有限公开数据和预设规则生成，仅用于信息排序，不代表未来收益或损失概率。页面内容不构成投资建议。")
