#!/bin/bash
# macOS 双击即可运行：把本地改动推送到 GitHub 并自动部署 Pages
cd "$(dirname "$0")/.." || exit 1
echo "== AI 产品经理学习平台 · 一键推送 =="
echo "工作目录：$(pwd)"
echo
python3 scripts/push_to_github.py "$@"
status=$?
echo
if [ "$status" -eq 0 ]; then
  echo "完成。在线站点：https://2013102249.github.io/ai-pm-learning-platform/"
else
  echo "推送未成功，请根据上方错误信息处理后重试。"
fi
echo
read -r -p "按回车键关闭窗口…" _
exit "$status"
