#!/bin/zsh
cd "$(dirname "$0")" || exit 1
slidecraft_node="$(command -v node)"
if [[ -z "$slidecraft_node" ]]; then
  slidecraft_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$slidecraft_node" ]]; then
  echo '请先安装 Node.js 20.12 或更高版本，再重新启动。'
  read -r '?按回车关闭'
  exit 1
fi
"$slidecraft_node" scripts/setup.mjs || exit 1
"$slidecraft_node" scripts/start-background.mjs || exit 1
open http://127.0.0.1:${PORT:-4173}
