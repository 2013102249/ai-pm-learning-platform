#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地一键 API 推送 —— 绕开 git push 的 HTTP/2 / 代理传输问题。

直接比对本地文件与 GitHub 远端 main 分支，只上传有差异的文件，
通过 Git Data API 生成一个 commit 并更新 ref，从而触发 GitHub Actions 自动部署。

用法（在平台目录任意位置均可运行）：
  python3 scripts/push_to_github.py                    # 推送全部本地变更
  python3 scripts/push_to_github.py -m "更新课程数据"  # 自定义提交信息
  python3 scripts/push_to_github.py --dry-run         # 只预览变更，不提交
  python3 scripts/push_to_github.py --open            # 提交后打开在线站点
  python3 scripts/push_to_github.py --repo owner/repo # 推到另一个仓库

认证优先级：环境变量 GITHUB_TOKEN > macOS 钥匙串中的 git 凭据（x-access-token）。
不把 token 写入任何文件、URL 或日志。
"""
from __future__ import annotations

import argparse
import base64
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REPO = "2013102249/ai-pm-learning-platform"
BRANCH = "main"
API = "https://api.github.com"
EXCLUDE_DIRS = {".git", ".workbuddy", "website", "__pycache__", "node_modules", ".idea", ".vscode"}
BASE_IGNORES = {".DS_Store", "*.zip", "*.pyc", "*.log", "*.tmp", "*.swp"}
MAX_FILE = 50 * 1024 * 1024


def die(msg: str):
    print("\n[失败] " + msg, file=sys.stderr)
    sys.exit(1)


def get_token() -> str:
    tok = os.environ.get("GITHUB_TOKEN", "").strip()
    if tok:
        return tok
    try:
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
        p = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True, text=True, timeout=20, env=env,
        )
        for line in p.stdout.splitlines():
            if line.startswith("password="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return value
    except Exception as exc:
        print("读取钥匙串凭据失败：%s" % exc, file=sys.stderr)
    die("未找到 GitHub 凭据。请设置 GITHUB_TOKEN，或确认钥匙串中已保存 github.com 凭据。")


class GH:
    def __init__(self, token: str):
        self.h = {
            "Authorization": "Bearer " + token,
            "User-Agent": "aipm-learning-platform-push",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        }

    def req(self, path: str, method: str = "GET", payload=None, retries: int = 2):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        for attempt in range(retries + 1):
            try:
                req = urllib.request.Request(API + path, method=method, data=data, headers=self.h)
                with urllib.request.urlopen(req, timeout=90) as r:
                    raw = r.read()
                    return r.status, (json.loads(raw) if raw else {})
            except urllib.error.HTTPError as e:
                try:
                    body = json.loads(e.read() or b"{}")
                except Exception:
                    body = {}
                if attempt < retries and e.code in (429, 502, 503, 504):
                    time.sleep(1.5)
                    continue
                return e.code, body
            except Exception as e:
                if attempt < retries:
                    time.sleep(1.5)
                    continue
                return 0, {"message": str(e)}


def ignore_patterns() -> set:
    pats = set(BASE_IGNORES)
    gi = ROOT / ".gitignore"
    if gi.exists():
        for line in gi.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                pats.add(line)
    return pats


def is_ignored(rel: str, pats: set) -> bool:
    name = rel.split("/")[-1]
    for raw in pats:
        pat = raw.strip().lstrip("/")
        if not pat:
            continue
        if pat.endswith("/"):
            if rel.startswith(pat) or ("/" + pat) in ("/" + rel):
                return True
        elif fnmatch.fnmatch(name, pat) or fnmatch.fnmatch(rel, pat):
            return True
    return False


def local_files() -> dict:
    pats = ignore_patterns()
    out = {}
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        parts = rel.split("/")
        if parts[0] in EXCLUDE_DIRS or any(x in EXCLUDE_DIRS for x in parts[:-1]):
            continue
        if is_ignored(rel, pats):
            continue
        raw = p.read_bytes()
        if len(raw) > MAX_FILE:
            die("文件超过 50MB，请先压缩或加入 .gitignore：%s" % rel)
        sha = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        out[rel] = (sha, raw, "100755" if os.access(p, os.X_OK) else "100644")
    return out


def main():
    ap = argparse.ArgumentParser(description="通过 GitHub API 推送平台文件并触发 Pages 自动部署")
    ap.add_argument("-m", "--message", default="", help="提交信息")
    ap.add_argument("--dry-run", action="store_true", help="只列出变更，不提交")
    ap.add_argument("--status", action="store_true", help="同 --dry-run，查看待推送变更")
    ap.add_argument("--open", action="store_true", help="提交后打开在线站点（macOS）")
    ap.add_argument("--repo", default=DEFAULT_REPO, help="目标仓库 owner/repo")
    args = ap.parse_args()

    owner, _, repo = args.repo.partition("/")
    if not repo:
        die("--repo 格式应为 owner/repo")
    base = "/repos/%s/%s" % (owner, repo)
    site = "https://%s.github.io/%s/" % (owner, repo)
    gh = GH(get_token())

    print("== AI 产品经理学习平台 · 一键推送 ==")
    print("仓库：%s  分支：%s" % (args.repo, BRANCH))

    code, ref = gh.req(base + "/git/ref/heads/" + BRANCH)
    if code != 200:
        die("读取远端分支失败：%s %s" % (code, ref.get("message")))
    head = ref["object"]["sha"]
    code, commit = gh.req(base + "/git/commits/" + head)
    if code != 200:
        die("读取远端提交失败：%s %s" % (code, commit.get("message")))
    tree_sha = commit["tree"]["sha"]
    code, tree = gh.req(base + "/git/trees/" + tree_sha + "?recursive=1")
    if code != 200:
        die("读取远端文件树失败：%s %s" % (code, tree.get("message")))
    remote = {t["path"]: t["sha"] for t in tree.get("tree", []) if t.get("type") == "blob"}

    local = local_files()
    added = [p for p in local if p not in remote]
    modified = [p for p in local if p in remote and local[p][0] != remote[p]]
    deleted = [p for p in remote if p not in local]
    total = len(added) + len(modified) + len(deleted)

    print("\n本地文件 %d 个 / 远端文件 %d 个 / 待提交变更 %d 项" % (len(local), len(remote), total))
    for p in sorted(added):
        print("  + 新增   %-48s %8d B" % (p, len(local[p][1])))
    for p in sorted(modified):
        print("  ~ 修改   %-48s %8d B" % (p, len(local[p][1])))
    for p in sorted(deleted):
        print("  - 删除   %s" % p)

    if total == 0:
        print("\n没有需要推送的变更，线上已是最新。\n在线站点：%s" % site)
        return 0
    if args.dry_run or args.status:
        print("\n预览模式：未创建提交。去掉 --dry-run / --status 即可推送。")
        return 0

    print("\n上传变更文件…")
    entries = []
    for p in sorted(added + modified):
        sha, raw, mode = local[p]
        code, blob = gh.req(base + "/git/blobs", "POST",
                            {"content": base64.b64encode(raw).decode("ascii"), "encoding": "base64"})
        if code != 201:
            die("上传 %s 失败：%s %s" % (p, code, blob.get("message")))
        entries.append({"path": p, "mode": mode, "type": "blob", "sha": blob["sha"]})
        print("  ↑ %s" % p)
    for p in sorted(deleted):
        entries.append({"path": p, "mode": "100644", "type": "blob", "sha": None})

    code, nt = gh.req(base + "/git/trees", "POST", {"base_tree": tree_sha, "tree": entries})
    if code != 201:
        die("创建文件树失败：%s %s" % (code, nt.get("message")))
    now = datetime.now(timezone.utc).isoformat()
    who = {"name": owner, "email": "%s@users.noreply.github.com" % owner, "date": now}
    msg = args.message.strip() or (
        "Update site content (+%d added, ~%d modified, -%d deleted)"
        % (len(added), len(modified), len(deleted))
    )
    code, c = gh.req(base + "/git/commits", "POST",
                     {"message": msg, "tree": nt["sha"], "parents": [head],
                      "author": who, "committer": who})
    if code != 201:
        die("创建提交失败：%s %s" % (code, c.get("message")))
    code, r = gh.req(base + "/git/refs/heads/" + BRANCH, "PATCH", {"sha": c["sha"], "force": False})
    if code != 200:
        die("更新分支失败：%s %s" % (code, r.get("message")))

    print("\n[完成] 提交 %s 已推送到 %s" % (c["sha"][:10], BRANCH))
    print("  Actions 正在自动部署：https://github.com/%s/actions" % args.repo)
    print("  在线站点（约 1 分钟后生效）：%s" % site)
    if args.open:
        try:
            subprocess.run(["open", site], check=False)
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
