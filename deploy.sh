#!/bin/bash
# MoonTVPlus 部署脚本：本地构建 Next.js 产物 → 叠加到服务器上的依赖基础镜像 → 试跑 → 替换线上容器。
#
# 为什么这样部署：
#   - 不在服务器上 next build：服务器内存小，会 OOM。
#   - 不在本地打完整镜像：本地多为 macOS/arm64，better-sqlite3 等原生依赖需要 Linux 版本，
#     所以生产依赖装在服务器上的基础镜像里（Dockerfile.base），每次部署只叠加应用产物（Dockerfile.overlay）。
#
# 用法：
#   cp .deploy.env.example .deploy.env   首次：填写服务器信息（该文件不提交）
#   ./deploy.sh --rebuild-base            首次或 pnpm-lock.yaml 变化后：先在服务器重建依赖基础镜像，再部署
#   ./deploy.sh                           部署当前提交
#   ./deploy.sh --dry-run                 只构建并在服务器上试跑新镜像，不替换线上容器
#   ./deploy.sh --allow-dirty             允许工作区有未提交的改动（镜像标签带 -dirty）
#
# 已处理的坑：
#   - 构建时不能设置 NEXT_PUBLIC_STORAGE_TYPE：客户端运行时从 window.RUNTIME_CONFIG 读取，
#     构建时写死会改变“继续观看”等页面的行为；存储类型只由服务器的 docker-compose.yml 提供。
#   - next build 在 macOS 上偶发卡死（编译进程不再占用 CPU 也不再输出），脚本会结束并重试，
#     保留 .next/cache，已编译完的部分直接命中缓存。
#   - next-pwa 生成的 public/sw.js、workbox-*.js 不在 git 中，必须随本次产物一起部署。
#   - 新镜像先在临时容器里试跑通过才替换线上容器；替换后不健康会自动回滚到上一版。
set -euo pipefail

cd "$(dirname "$0")"

die() { echo "❌ $*" >&2; exit 1; }
step() { printf '\n== %s ==\n' "$*"; }

REBUILD_BASE=0 DRY_RUN=0 ALLOW_DIRTY=0
for arg in "$@"; do
  case $arg in
    --rebuild-base) REBUILD_BASE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) die "未知参数：$arg（用 --help 查看用法）" ;;
  esac
done

[ -f .deploy.env ] || die "缺少 .deploy.env：请先 cp .deploy.env.example .deploy.env 并填写服务器信息"
# shellcheck source=/dev/null
. ./.deploy.env
[ -n "${DEPLOY_HOST:-}" ] || die ".deploy.env 中没有设置 DEPLOY_HOST"
DEPLOY_USER=${DEPLOY_USER:-admin}
DEPLOY_DIR=${DEPLOY_DIR:-/opt/moontvplus}
DEPLOY_IMAGE=${DEPLOY_IMAGE:-moontvplus}
DEPLOY_CONTAINER=${DEPLOY_CONTAINER:-moontvplus}
REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

# ---------- SSH：复用同一条连接，整个部署只需输入一次密码 ----------
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=/tmp/moontv-deploy-%C" -o ControlPersist=3600 -o ServerAliveInterval=30)
if [ -n "${DEPLOY_SSH_OPTS:-}" ]; then
  read -r -a extra_opts <<<"$DEPLOY_SSH_OPTS"
  SSH_OPTS+=("${extra_opts[@]}")
fi
trap 'ssh "${SSH_OPTS[@]}" -O exit "$REMOTE" >/dev/null 2>&1 || true' EXIT

rssh() { ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"; }
# 在服务器上用 bash 执行标准输入里的脚本，参数转义后传入
rbash() { rssh "bash -s -- $(printf '%q ' "$@")"; }
# upload <服务器目录> [tar 选项...] <本地路径...>：打包后经 SSH 直接解压到服务器目录（会先清空该目录）
upload() {
  local dest
  dest=$(printf '%q' "$1")
  shift
  COPYFILE_DISABLE=1 tar --no-xattrs -czf - "$@" | rssh "rm -rf $dest && mkdir -p $dest && tar xzf - -C $dest"
}

file_sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# ---------- next build 卡死检测 ----------
descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    echo "$child"
    descendants "$child"
  done
}
# 进程树累计 CPU 秒数（取整）
tree_cpu() {
  local pids
  pids=$(echo "$1" $(descendants "$1") | tr ' ' ',')
  ps -o time= -p "$pids" 2>/dev/null |
    awk -F: '{ s = 0; for (i = 1; i <= NF; i++) s = s * 60 + $i; t += s } END { printf "%d", t }'
}
kill_tree() {
  local p
  for p in $(descendants "$1") "$1"; do kill "$p" 2>/dev/null || true; done
}

# 返回 75 表示卡死：连续 2 分钟既没有 CPU 消耗也没有新输出
build_once() {
  local log=$1 pid tail_pid cpu lines last=-1 last_lines=-1 idle=0 rc=0
  NEXT_TELEMETRY_DISABLED=1 pnpm build >"$log" 2>&1 &
  pid=$!
  tail -n +1 -f "$log" &
  tail_pid=$!
  # 后台进程收不到 Ctrl+C，需要手动结束整棵进程树
  trap 'kill_tree "$pid"; kill "$tail_pid" 2>/dev/null; exit 130' INT TERM
  while kill -0 "$pid" 2>/dev/null; do
    sleep 15
    cpu=$(tree_cpu "$pid")
    lines=$(wc -l <"$log" | tr -d ' ')
    if [ "$cpu" -le "$last" ] && [ "$lines" -eq "$last_lines" ]; then
      idle=$((idle + 15))
    else
      idle=0
    fi
    last=$cpu
    last_lines=$lines
    if [ "$idle" -ge 120 ]; then
      kill_tree "$pid"
      wait "$pid" 2>/dev/null || true
      rc=75
      break
    fi
  done
  [ "$rc" = 75 ] || wait "$pid" || rc=$?
  sleep 1
  kill "$tail_pid" 2>/dev/null || true
  wait "$tail_pid" 2>/dev/null || true # 回收进程，避免 bash 打印 "Terminated" 提示
  trap - INT TERM
  return "$rc"
}

build_with_retry() {
  local log=/tmp/moontv-build.log attempt rc
  for attempt in 1 2 3; do
    # 保留 .next/cache：已编译完的部分下次直接命中缓存
    if [ -d .next ]; then find .next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +; fi
    rc=0
    build_once "$log" || rc=$?
    case $rc in
      0) return 0 ;;
      75) printf '\n⚠️  构建 2 分钟没有任何进展（next build 在 macOS 上偶发卡死），结束后重试（%s/3）…\n' "$attempt" ;;
      *) die "构建失败（退出码 $rc），完整日志：$log" ;;
    esac
  done
  die "构建连续 3 次卡死，请稍后重试；日志：$log"
}

# ---------- 版本信息 ----------
DIRTY=
if [ -n "$(git status --porcelain)" ]; then
  [ "$ALLOW_DIRTY" = 1 ] || die "工作区有未提交的改动，请先提交（或加 --allow-dirty）"
  DIRTY=-dirty
fi
COMMIT=$(git rev-parse --short HEAD)
VERSION=$(tr -d '[:space:]' <VERSION.txt)
TAG="v${VERSION}-${COMMIT}${DIRTY}"
LOCK_SHA=$(file_sha256 pnpm-lock.yaml)
echo "部署 $TAG → $REMOTE:$DEPLOY_DIR$([ "$DRY_RUN" = 1 ] && echo '（演练：不替换线上容器）')"

# ---------- 检查服务器 ----------
step "检查服务器（首次连接需要输入 SSH 密码）"
base_lock=$(rbash "$DEPLOY_IMAGE" <<'EOF'
sudo -n true 2>/dev/null || { echo NO_SUDO; exit 0; }
command -v docker >/dev/null || { echo NO_DOCKER; exit 0; }
if ss -ltn 2>/dev/null | grep -q ':3099 '; then echo PORT_BUSY; exit 0; fi
sudo -n docker image inspect -f '{{ index .Config.Labels "moontv.lock-sha256" }}' "$1:base" 2>/dev/null || echo NO_BASE
EOF
)
case $base_lock in
  NO_SUDO) die "$DEPLOY_USER 在服务器上没有免密 sudo" ;;
  NO_DOCKER) die "服务器上没有安装 docker" ;;
  PORT_BUSY) die "服务器 127.0.0.1:3099 被占用，试跑新镜像需要用到这个端口" ;;
esac
if [ "$REBUILD_BASE" = 0 ]; then
  [ "$base_lock" != NO_BASE ] || die "服务器上还没有依赖基础镜像 $DEPLOY_IMAGE:base，请运行 ./deploy.sh --rebuild-base"
  [ "$base_lock" = "$LOCK_SHA" ] || die "pnpm-lock.yaml 和服务器基础镜像的依赖不一致，请运行 ./deploy.sh --rebuild-base"
fi
echo "服务器就绪"

# ---------- 依赖基础镜像 ----------
if [ "$REBUILD_BASE" = 1 ]; then
  step "在服务器上重建依赖基础镜像（安装生产依赖，首次约 5~10 分钟）"
  BASE_CTX="/tmp/moontv-base-$COMMIT"
  upload "$BASE_CTX" Dockerfile.base package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
  rbash "$BASE_CTX" "$DEPLOY_IMAGE" "$LOCK_SHA" "${DEPLOY_BASE_OS_IMAGE:-ubuntu:22.04}" <<'EOF'
set -euo pipefail
ctx=$1 image=$2 lock=$3 os_image=$4
trap 'rm -rf "$ctx"' EXIT
if ! sudo -n docker build -f "$ctx/Dockerfile.base" --build-arg "BASE_OS_IMAGE=$os_image" \
  --label "moontv.lock-sha256=$lock" -t "$image:base" "$ctx"; then
  echo "提示：如果上面是 pull access denied，说明服务器拉不到 $os_image，请在 .deploy.env 里设置 DEPLOY_BASE_OS_IMAGE"
  exit 1
fi
EOF
  echo "基础镜像已更新：$DEPLOY_IMAGE:base"
fi

# ---------- 本地构建 ----------
step "准备 Node 环境"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  set +u
  # shellcheck source=/dev/null
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use >/dev/null 2>&1 || echo "（nvm 没有安装 .nvmrc 指定的 $(cat .nvmrc)，使用当前 Node）"
  set -u
fi
command -v node >/dev/null || die "没有找到 node"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || die "Node 版本过低（$(node -v)），需要 18 以上，建议 $(cat .nvmrc)"
command -v pnpm >/dev/null || die "没有找到 pnpm，请先运行 corepack enable"
echo "Node $(node -v)，pnpm $(pnpm -v)"

unset NEXT_PUBLIC_STORAGE_TYPE
for f in .env .env.local .env.production .env.production.local; do
  if [ -f "$f" ] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?NEXT_PUBLIC_STORAGE_TYPE=' "$f"; then
    die "$f 里设置了 NEXT_PUBLIC_STORAGE_TYPE，构建时会被写死进产物；请先注释掉（线上由 docker-compose.yml 提供）"
  fi
done

step "安装依赖"
pnpm install --frozen-lockfile

step "构建 Next.js 产物（约 3~6 分钟）"
build_with_retry
[ -f .next/BUILD_ID ] && [ -d .next/standalone ] || die "构建结束但没有产出 .next/standalone"
BUILD_ID=$(cat .next/BUILD_ID)
grep -q "$BUILD_ID" public/sw.js || die "public/sw.js 不是本次构建生成的（next-pwa 没有正常输出）"
echo "构建完成：BUILD_ID=$BUILD_ID"

# ---------- 上传并在服务器上构建、试跑、替换 ----------
step "上传产物"
CTX="/tmp/moontv-deploy-$TAG"
upload "$CTX" --exclude=.next/standalone/node_modules --exclude='public/screenshot*.png' \
  .next/standalone .next/static public scripts migrations start.js server.js src/lib/tv-remote-hub.js Dockerfile.overlay
echo "已上传到 $CTX"

step "服务器：构建镜像、试跑、替换线上容器"
rbash "$CTX" "$TAG" "$COMMIT" "$DEPLOY_IMAGE" "$DEPLOY_CONTAINER" "$DEPLOY_DIR" "$DRY_RUN" <<'EOF'
set -euo pipefail
ctx=$1 tag=$2 commit=$3 image=$4 container=$5 dir=$6 dry_run=$7
docker() { sudo -n docker "$@"; }
trap 'rm -rf "$ctx"' EXIT

echo "-- 构建镜像 $image:$tag"
docker build -q -f "$ctx/Dockerfile.overlay" --build-arg "BASE_IMAGE=$image:base" \
  --label "moontv.commit=$commit" -t "$image:$tag" "$ctx" >/dev/null

echo "-- 用临时容器试跑（独立的临时数据库，不碰线上数据）"
smoke="$container-smoke"
docker rm -f "$smoke" >/dev/null 2>&1 || true
docker run -d --name "$smoke" -p 127.0.0.1:3099:3000 \
  -e SQLITE_DB_PATH=/tmp/smoke.db -e NEXT_PUBLIC_STORAGE_TYPE=d1 \
  -e USERNAME=smoke -e "PASSWORD=$(od -An -tx1 -N12 /dev/urandom | tr -d ' \n')" \
  "$image:$tag" >/dev/null
ok=0
for _ in $(seq 1 40); do
  if curl -fsS -m 5 -o /dev/null http://127.0.0.1:3099/api/server-config 2>/dev/null; then ok=1; break; fi
  sleep 3
done
[ "$ok" = 1 ] || docker logs --tail 30 "$smoke" || true
docker rm -f "$smoke" >/dev/null
[ "$ok" = 1 ] || { echo "❌ 新镜像试跑失败，线上容器没有改动"; exit 1; }
echo "   试跑通过"

if [ "$dry_run" = 1 ]; then
  echo "-- 演练结束：线上容器没有改动，新镜像保留为 $image:$tag"
  exit 0
fi

echo "-- 替换线上容器"
if docker image inspect "$image:latest" >/dev/null 2>&1; then docker tag "$image:latest" "$image:prev"; fi
docker tag "$image:$tag" "$image:latest"
cd "$dir"
sudo -n docker compose up -d --no-build
status=starting
for _ in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)
  if [ "$status" = healthy ] || [ "$status" = unhealthy ]; then break; fi
  sleep 5
done
if [ "$status" != healthy ]; then
  echo "❌ 新容器状态为 $status，回滚到上一版"
  docker tag "$image:prev" "$image:latest"
  sudo -n docker compose up -d --no-build
  exit 1
fi
echo "   新容器健康：$(docker exec "$container" curl -fsS http://localhost:3000/api/server-config | grep -o '"Version":"[^"]*"')"

echo "-- 清理旧的部署镜像（保留最近 3 个版本，以及 base / prev / latest）"
docker image ls "$image" --format '{{.Tag}}' |
  grep -v -x -E 'base|prev|latest|<none>' | grep -v -x -F "$tag" | tail -n +3 |
  while read -r old; do docker rmi "$image:$old" >/dev/null 2>&1 && echo "   删除 $image:$old" || true; done
EOF

step "完成"
if [ "$DRY_RUN" = 1 ]; then
  echo "演练通过：$TAG 已在服务器上构建并试跑成功，线上容器没有改动。"
else
  echo "线上已是 $TAG"
  echo "如需回滚：ssh $REMOTE 'cd $DEPLOY_DIR && sudo docker tag $DEPLOY_IMAGE:prev $DEPLOY_IMAGE:latest && sudo docker compose up -d --no-build'"
fi
