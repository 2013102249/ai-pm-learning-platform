# -*- coding: utf-8 -*-
"""从两个 GitHub 仓库的原始数据构建学习平台数据包 -> data/data.js

数据源均位于 sources/：
  course-outline.html  课程资源包 · 八周体系大纲
  kit-index.html       课程资源包 · 首页（40 天清单与新增主线）
  quiz-entry.html      40 天分层习题测评入口（飞书表单）
  exercises.json       352 道分层习题
  kit-tree.json        课程资源包文件清单
  slides-index.json    在线课件 40 讲索引
  qbank.json           面试备考平台 775 道真题
  glossary.html        面试备考平台 115 条术语词库
运行：python3 scripts/build_data.py
"""
import json
import os
import re
import html
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "sources")
OUT = os.path.join(BASE, "data", "data.js")

KIT = "https://2013102249.github.io/ai-pm-course-kit/"
PREP = "https://2013102249.github.io/ai-pm-interview-platform/"
REPO_KIT = "https://github.com/2013102249/ai-pm-course-kit"
REPO_PREP = "https://github.com/2013102249/ai-pm-interview-platform"


def kiturl(path):
    return KIT + urllib.parse.quote(path, safe="/")


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def read(name):
    return open(os.path.join(SRC, name), encoding="utf-8").read()


outline = read("course-outline.html")
kitindex = read("kit-index.html")
quizentry = read("quiz-entry.html")
exercises = json.loads(read("exercises.json"))
tree = [x["path"] for x in json.loads(read("kit-tree.json"))]
slides = json.loads(read("slides-index.json"))["decks"]
qbank_raw = json.loads(read("qbank.json"))["questions"]
glossary_html = read("glossary.html")

# ---------------------------------------------------------------- 八周总览表
overview = {}
for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", outline, re.S):
    tds = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S)
    if len(tds) >= 4 and re.fullmatch(r"W\d", clean(tds[0])):
        wid = clean(tds[0])
        overview[wid] = {
            "theme": clean(tds[1]),
            "weekendOutput": clean(tds[2]),
            "abilityTags": [clean(x) for x in re.findall(r"<span class=\"pill[^\"]*\"[^>]*>(.*?)</span>", tds[3], re.S)],
        }

# ---------------------------------------------------------------- 40 天物料清单
day_meta = {}
for m in re.finditer(
    r"<a href=\"(W\d-物料/[^\"]+/01-教案\.html)\"[^>]*>\s*"
    r"<span class=\"no\">(W\dD\d)</span>\s*<span class=\"t\">(.*?)</span>\s*"
    r"<span class=\"d\">(.*?)</span>", kitindex, re.S):
    href, did, title, desc = m.group(1), m.group(2), clean(m.group(3)), clean(m.group(4))
    day_meta[did] = {"folder": href.rsplit("/", 1)[0], "kitTitle": title, "highlight": desc}

# ---------------------------------------------------------------- 测评表单
form_urls = {}
for m in re.finditer(r"<a class=\"day\" href=\"([^\"]+)\"[^>]*>\s*<span class=\"no\">(W\dD\d)</span>", quizentry, re.S):
    form_urls[m.group(2)] = m.group(1)

# ---------------------------------------------------------------- 课件索引
deck_by_day = {d["id"]: d for d in slides}

# ---------------------------------------------------------------- 每日八件套
FILE_LABELS = {
    "教案": "教案", "讲课稿": "讲课稿", "导学案": "导学案", "播客稿": "播客稿",
    "配图清单": "配图清单", "分层习题": "分层习题", "交互使用说明": "交互说明",
    "课堂交互使用说明": "交互说明", "PPT大纲": "PPT 大纲", "就业数据页": "就业数据页",
    "技术零层": "技术零层", "积木卡": "积木卡", "检查卡": "检查卡",
}
day_files = {}
for did, meta in day_meta.items():
    folder = meta["folder"] + "/"
    files = sorted([p[len(folder):] for p in tree if p.startswith(folder) and p.endswith(".html")])
    items = []
    for f in files:
        name = os.path.splitext(f)[0]
        stem = re.sub(r"^\d+-", "", name)
        label = stem
        for key, val in FILE_LABELS.items():
            if key in stem:
                label = val
                break
        if re.match(r"^09-积木卡", f):
            label = "积木卡 · " + stem.split("-")[-1]
        items.append({"name": label, "file": f, "url": kiturl(folder + f)})
    day_files[did] = items

# ---------------------------------------------------------------- 周课表解析
blocks = re.split(r"<div class=\"week-head\"", outline)[1:]
WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五"]
weeks = []
for i, blk in enumerate(blocks[:8], start=1):
    wid = "W%d" % i
    no_m = re.search(r"<span class=\"n\"[^>]*>(\d+)</span>", blk)
    title_m = re.search(r"<h3[^>]*>(.*?)</h3>", blk, re.S)
    st_m = re.search(r"<div class=\"st\"[^>]*>(.*?)</div>", blk, re.S)
    st = clean(st_m.group(1)) if st_m else ""
    stage, keywords = "", ""
    if "｜" in st:
        stage, kw = st.split("｜", 1)
        keywords = kw.replace("关键词：", "").strip()
    else:
        stage = st

    days, weekend = [], ""
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", blk, re.S):
        dm = re.search(r"<span class=\"day[^\"]*\"[^>]*>(.*?)</span>", tr, re.S)
        if not dm:
            continue
        label = clean(dm.group(1))
        hm = re.search(r"<td[^>]*class=\"hw\"[^>]*>(.*?)</td>", tr, re.S)
        hw_html = hm.group(1) if hm else ""
        hw = clean(hw_html)
        if label == "周末":
            weekend = re.sub(r"^综合输出：\s*", "", hw)
            continue
        if label not in WEEK_LABELS:
            continue
        lm = re.search(r"<span class=\"lesson\"[^>]*>(.*?)</span>", tr, re.S)
        sm = re.search(r"<span class=\"lesson-sub\"[^>]*>(.*?)</span>", tr, re.S)
        bm = re.search(r"<b[^>]*>(.*?)</b>", hw_html, re.S)
        did = "%sD%d" % (wid, WEEK_LABELS.index(label) + 1)
        meta = day_meta.get(did, {})
        deck = deck_by_day.get(did, {})
        theory = clean(sm.group(1)) if sm else ""
        points = [p.strip() for p in re.split(r"[；;]", theory) if len(p.strip()) > 3]
        days.append({
            "id": did,
            "label": label,
            "title": clean(lm.group(1)) if lm else meta.get("kitTitle", ""),
            "theory": theory,
            "points": points,
            "practice": hw,
            "deliverable": re.sub(r"[：:]\s*$", "", clean(bm.group(1))) if bm else hw[:24],
            "highlight": meta.get("highlight", ""),
            "folder": meta.get("folder", ""),
            "files": day_files.get(did, []),
            "formUrl": form_urls.get(did, ""),
            "deckPages": deck.get("pages", 0),
            "deckUrl": kiturl("PPT在线版/index.html") + "#/deck/" + did,
            "quizCount": sum(1 for q in exercises if q["day"] == did),
        })

    acc_m = re.search(r"<div class=\"wf-l\".*?<ul[^>]*>(.*?)</ul>", blk, re.S)
    acceptance = [clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>", acc_m.group(1), re.S)] if acc_m else []
    wf_r = blk.split('class="wf-r"', 1)[1][:2500] if 'class="wf-r"' in blk else ""
    abilities = [clean(x) for x in re.findall(r"<span class=\"pill[^\"]*\"[^>]*>(.*?)</span>", wf_r, re.S)]
    coach_m = re.search(r"<div class=\"coach\"[^>]*>(.*?)</div>", blk, re.S)
    coach = re.sub(r"^讲师提示：\s*", "", clean(coach_m.group(1))) if coach_m else ""
    ov = overview.get(wid, {})
    weeks.append({
        "id": wid,
        "no": "%02d" % i,
        "title": clean(title_m.group(1)) if title_m else ov.get("theme", ""),
        "theme": ov.get("theme", ""),
        "stage": stage.strip(),
        "keywords": keywords,
        "weekendOutput": ov.get("weekendOutput", ""),
        "abilityTags": ov.get("abilityTags", []),
        "weekend": weekend,
        "acceptance": acceptance,
        "abilities": abilities,
        "coach": coach,
        "days": days,
    })

# ---------------------------------------------------------------- 阶段 / 里程碑
stages = [
    {"name": "认知筑基", "range": "W1–W2", "desc": "职业认知 · 技术通识 · 提示词 · 评测合规", "weeks": ["W1", "W2"]},
    {"name": "AI 核心能力", "range": "W3", "desc": "Agent 架构 · RAG 知识库 · 多模态产品", "weeks": ["W3"]},
    {"name": "产品硬功", "range": "W4–W5", "desc": "需求分析 · PRD · 数据 · 增长 · 商业化", "weeks": ["W4", "W5"]},
    {"name": "实战与就业", "range": "W6–W8", "desc": "主项目闭环 · 作品集 · 简历 · 面试冲刺", "weeks": ["W6", "W7", "W8"]},
]
milestones = [
    {"id": "m1", "week": "W2", "when": "W2 · 周五", "name": "立项", "desc": "选题 + 目标用户 + 核心场景 + 成功指标，讲师评审锁定", "deliverable": "主项目立项报告"},
    {"id": "m2", "week": "W3", "when": "W3 · 周五", "name": "原型", "desc": "Agent 架构图 + Dify/Coze 工作流 + 知识库原型，可演示", "deliverable": "主项目原型 V1.5"},
    {"id": "m3", "week": "W4", "when": "W4 · 周五", "name": "PRD 过审", "desc": "调研报告支撑的 PRD V2.0 + 异常兜底设计 + 指标体系", "deliverable": "PRD V2.0（过审版）"},
    {"id": "m4", "week": "W5", "when": "W5 · 周五", "name": "商业验证", "desc": "商业模式画布 + 单位经济模型 + AB 实验设计方案", "deliverable": "终版需求范围 V3 Scope"},
    {"id": "m5", "week": "W6", "when": "W6 · 周五", "name": "MVP 路演", "desc": "可在线访问的 MVP + ≥10 真实用户试用 + 结业路演", "deliverable": "可访问演示链接 + 复盘文档"},
]

# ---------------------------------------------------------------- 面试题库精简
QB_FIELDS = ["id", "src", "srcName", "no", "q", "a", "level", "type", "tags", "topic", "chapter", "round", "part", "expTitle", "origin"]
qbank = [{k: q.get(k, "") for k in QB_FIELDS} for q in qbank_raw]

WEEK_QKW = {
    "W1": ["岗位", "职业规划", "AI 产品经理", "提示词", "Prompt", "大模型", "行业", "转行"],
    "W2": ["模型选型", "微调", "LoRA", "评测", "badcase", "合规", "幻觉", "Benchmark", "SFT"],
    "W3": ["Agent", "RAG", "知识库", "MCP", "多模态", "工作流", "Embedding", "检索"],
    "W4": ["需求分析", "用户研究", "PRD", "兜底", "指标", "SQL", "KANO", "访谈"],
    "W5": ["增长", "AARRR", "AB 实验", "商业化", "定价", "token", "成本", "留存", "转化"],
    "W6": ["MVP", "Vibe Coding", "测试", "验收", "路演", "原型", "用户试用", "上线"],
    "W7": ["作品集", "简历", "行业", "投递", "STAR", "转行"],
    "W8": ["面试", "压力面", "谈薪", "项目深挖", "场景设计", "技术理解", "offer", "行为面"],
}
for w in weeks:
    kws = WEEK_QKW[w["id"]]
    scored = []
    for q in qbank:
        text = (q["q"] + " " + " ".join(q["tags"] or []) + " " + str(q["topic"] or "")).lower()
        sc = sum(1 for k in kws if k.lower() in text)
        if sc:
            scored.append((sc, q["id"]))
    scored.sort(key=lambda x: (-x[0], x[1]))
    w["suggestedQ"] = [qid for _, qid in scored[:8]]

# ---------------------------------------------------------------- 术语词库
cats = json.loads(re.search(r"const CATS = (\[.*?\]);", glossary_html, re.S).group(1))
terms = json.loads(re.search(r"const TERMS = (\[.*?\]);", glossary_html, re.S).group(1))

# ---------------------------------------------------------------- 资源库
def collect(prefix, pattern=None, exclude=None):
    out = []
    for p in tree:
        if not p.startswith(prefix) or not p.endswith(".html"):
            continue
        base = p[len(prefix):]
        if "/" in base:
            continue
        if pattern and not re.search(pattern, base):
            continue
        if exclude and re.search(exclude, base):
            continue
        label = re.sub(r"^\d+-", "", os.path.splitext(base)[0])
        out.append({"name": label, "url": kiturl(p), "desc": ""})
    return sorted(out, key=lambda x: x["name"])

resources = [
    {"id": "start", "name": "入门必读", "icon": "◈", "items": [
        {"name": "八周体系大纲（招生版）", "desc": "课程设计逻辑、八周总览、主线项目、每周课表与验收标准", "url": kiturl("课程大纲.html")},
        {"name": "课程资源包首页", "desc": "320 件物料总入口：八件套、样课日、交互工具、配图", "url": KIT},
        {"name": "八件套生产体系", "desc": "八件套标准与质量线、目录规范、40 天生产卡", "url": kiturl("00-八件套生产体系.html")},
        {"name": "样课日 W3D3 · RAG（标杆）", "desc": "教案 / 讲课稿 / 导学案 / 习题 / PPT 大纲八件齐备", "url": kiturl("01-样课日-W3D3-RAG/01-教案.html")},
        {"name": "技术零层 · 开课前 15 分钟", "desc": "10 个真实场景建立直觉 + 5 道判断题，通篇无原理名词", "url": kiturl("W1-物料/W1D2-大模型原理通识/00-技术零层.html")},
        {"name": "40 天测评提交总目录", "desc": "每天一个飞书表单，作答提交后由讲师在线批改", "url": kiturl("测评入口.html")},
    ]},
    {"id": "slides", "name": "在线课件", "icon": "▤", "items": [
        {"name": "40 讲课件 · 在线放映（612 页）", "desc": "按周目录、可搜课、方向键翻页、全屏放映，手机可看", "url": kiturl("PPT在线版/index.html")},
        {"name": "PPT 共享设计规范", "desc": "课件版式、配色与组件规范", "url": kiturl("PPT-共享设计规范.md")},
    ] + [{"name": "%s · %s（%d 页）" % (d["id"], d["title"], d["pages"]), "desc": "按讲直达在线放映", "url": kiturl("PPT在线版/index.html") + "#/deck/" + d["id"]} for d in slides]},
    {"id": "tools", "name": "交互工具", "icon": "⚙", "items": [
        {"name": "交互工具总入口", "desc": "4 个单文件零依赖工具，断网可用", "url": kiturl("02-交互工具/index.html")},
    ] + collect("02-交互工具/", exclude=r"index")},
    {"id": "think", "name": "产品思维小课", "icon": "✦", "items": [
        {"name": "小课总览 · 使用规则", "desc": "每周一开课前 10 分钟，四件套结构", "url": kiturl("00-产品思维小课/00-总览.html")},
    ] + collect("00-产品思维小课/", exclude=r"00-总览")},
    {"id": "cards", "name": "术语类比卡", "icon": "◉", "items": [
        {"name": "18 张术语卡总索引", "desc": "转行学员的术语速查库，网页版 + SVG", "url": kiturl("03-配图素材/术语卡/00-术语卡索引.html")},
    ] + collect("03-配图素材/术语卡/", exclude=r"00-术语卡索引")},
    {"id": "portfolio", "name": "作品集与就业证据链", "icon": "◇", "items": [
        {"name": "就业数据页", "desc": "岗位 / 城市 / offer 周期 / 薪资与三条典型转岗路径", "url": kiturl("W1-物料/W1D1-开营与岗位全景/09-就业数据页.html")},
    ] + [{"name": p.rsplit("/", 1)[-1].replace(".html", ""), "desc": "双周进度自查卡", "url": kiturl(p)} for p in tree if "检查卡" in p and p.endswith(".html")]
      + [{"name": p.rsplit("/", 1)[-1].replace(".html", "").replace("09-", ""), "desc": "作品集积木卡", "url": kiturl(p)} for p in tree if "积木卡-W" in p and p.endswith(".html")]},
    {"id": "interview", "name": "面试备考", "icon": "◆", "items": [
        {"name": "AI PM 面试备考平台", "desc": "775 道真题 · 7 大题库 · 10 套面经 · 模拟面试 · 飞书进度同步", "url": PREP},
        {"name": "AI 术语概念词库", "desc": "115 个核心词条 × 10 大分类，必背高频标注", "url": PREP + "glossary/"},
        {"name": "面试平台源码", "desc": "查看题库数据与二次开发说明", "url": REPO_PREP},
    ]},
    {"id": "source", "name": "原始仓库", "icon": "↗", "items": [
        {"name": "课程资源包 · GitHub", "desc": "ai-pm-course-kit · 1763 个文件 / 8 周全套物料", "url": REPO_KIT},
        {"name": "面试备考平台 · GitHub", "desc": "ai-pm-interview-platform · 775 题 + 术语词库", "url": REPO_PREP},
        {"name": "配图素材索引", "desc": "66 张自研 SVG 教具 + 18 张术语类比卡", "url": kiturl("03-配图素材/index.html")},
    ]},
]

# ---------------------------------------------------------------- 汇总输出
data = {
    "meta": {
        "title": "AI 产品经理学习平台",
        "subtitle": "8 周训练营 · 理论 → 实操 → 验收 闭环",
        "org": "新像素教育 · AI 产品经理训练营",
        "version": "V1.0 · 2026-11",
        "kitUrl": KIT,
        "prepUrl": PREP,
        "repoKit": REPO_KIT,
        "repoPrep": REPO_PREP,
        "stats": {
            "weeks": len(weeks),
            "days": sum(len(w["days"]) for w in weeks),
            "quiz": len(exercises),
            "qbank": len(qbank),
            "terms": len(terms),
            "decks": len(slides),
            "slides": sum(d["pages"] for d in slides),
            "milestones": len(milestones),
            "materials": sum(len(w["days"]) for w in weeks) * 8,
            "tools": 4,
            "stages": len(stages),
        },
        "designPrinciples": [
            "技术够用就好，产品硬功打底", "就业闭环，补齐最后 100 米", "一个主项目，贯穿全程",
            "行业纵深，拒绝海投", "国内合规，岗前必修", "每周验收，结果可衡量", "训练形式为就业服务",
        ],
        "auth": {
            "apiBase": "https://ai-pm-interview-486.app.workbuddy.host",
            "sharecode": "ML5MQW3TYD",
            "feishuBaseUrl": "https://15997672262.feishu.cn/base/UDXYbBLFqaQtrnsF8Mncn2PDndg",
            "learnTableId": "tblgBY1Psa8z94xi",
            "note": "与面试备考平台共用学员账号（4 位登记账号 + 手机号后 4 位密码）",
        },
        "rubric": ["合格（完成）", "良好（有数据有思考）", "优秀（可对外展示）"],
        "grading": "出勤 20% + 周产出 40% + 路演 20% + 面试模拟 20%",
    },
    "stages": stages,
    "weeks": weeks,
    "milestones": milestones,
    "quiz": exercises,
    "qbank": qbank,
    "glossary": {"cats": cats, "terms": terms},
    "resources": resources,
    "qbankSources": sorted(set(q["srcName"] for q in qbank)),
}

with open(OUT, "w", encoding="utf-8") as f:
    f.write("window.APP_DATA = ")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print("写出的文件:", OUT, os.path.getsize(OUT), "bytes")
print("周数:", len(weeks), "天数:", sum(len(w["days"]) for w in weeks))
print("习题:", len(exercises), "面试题:", len(qbank), "术语:", len(terms), "课件:", len(slides))
print("资源分类:", [(g["name"], len(g["items"])) for g in resources])
for w in weeks:
    print(" ", w["id"], w["title"][:24], "days", len(w["days"]),
          "files", sum(len(d["files"]) for d in w["days"]),
          "forms", sum(1 for d in w["days"] if d["formUrl"]),
          "quiz", sum(d["quizCount"] for d in w["days"]),
          "suggestQ", len(w["suggestedQ"]), "accept", len(w["acceptance"]))
