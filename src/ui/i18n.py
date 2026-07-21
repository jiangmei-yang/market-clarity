from __future__ import annotations

import streamlit as st


def get_language() -> str:
    return str(st.session_state.get("ui_language", "zh"))


def tr(zh: str, en: str) -> str:
    return en if get_language() == "en" else zh


def language_switcher() -> None:
    current = get_language()
    selected = st.sidebar.segmented_control(
        "Language",
        options=["中文", "EN"],
        default="EN" if current == "en" else "中文",
        label_visibility="collapsed",
        key="global_language_selector",
    )
    language = "en" if selected == "EN" else "zh"
    if language != current:
        st.session_state["ui_language"] = language
        st.rerun()
