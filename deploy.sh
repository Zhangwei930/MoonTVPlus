#!/bin/bash
# MoonTVPlus 迁移部署脚本 - 目标服务器 8.137.193.214
set -e

SERVER="8.137.193.214"
SERVER_USER="admin"
APP_DIR="/opt/moontvplus"
DB_EXPORT="/tmp/d1_remote_export.sql"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== MoonTVPlus 迁移部署 ==="
echo "提示：SSH 连接时请输入服务器密码 Zhangwei930."
echo ""

# 检查 D1 导出文件是否存在
if [ ! -f "$DB_EXPORT" ]; then
  echo "错误: 找不到 D1 数据库导出文件 $DB_EXPORT"
  echo "请先运行: npx wrangler d1 export moontvplus --remote --output=/tmp/d1_remote_export.sql"
  exit 1
fi

echo "1. 上传文件到服务器（需要输入密码）..."
scp -o StrictHostKeyChecking=no \
  "$DB_EXPORT" \
  "${SERVER_USER}@${SERVER}:/tmp/d1_remote_export.sql"

scp -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/.env" \
  "${SERVER_USER}@${SERVER}:/tmp/"

scp -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/Dockerfile.aliyun" \
  "${SERVER_USER}@${SERVER}:/tmp/Dockerfile.aliyun"

echo "2. 在服务器上执行部署（需要输入密码）..."
ssh -o StrictHostKeyChecking=no -tt "${SERVER_USER}@${SERVER}" << 'REMOTE_EOF'
set -e

APP_DIR="/opt/moontvplus"
REPO_URL="https://github.com/Zhangwei930/MoonTVPlus"

echo "--- 检查并安装 Docker ---"
if ! command -v docker &>/dev/null; then
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sudo bash
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker admin
  echo "Docker 安装完成: $(docker --version)"
else
  echo "Docker 已安装: $(docker --version)"
fi

echo "--- 准备项目目录 ---"
sudo mkdir -p "$APP_DIR"
sudo chown admin:admin "$APP_DIR"
cd "$APP_DIR"

echo "--- 克隆/更新代码 ---"
if [ -d ".git" ]; then
  echo "更新现有代码..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
else
  echo "克隆代码..."
  git clone "$REPO_URL" . || {
    echo "克隆失败，请检查仓库是否公开"
    exit 1
  }
fi

echo "--- 复制配置文件 ---"
cp /tmp/docker-compose.yml "$APP_DIR/docker-compose.yml"
cp /tmp/.env "$APP_DIR/.env"
cp /tmp/Dockerfile.aliyun "$APP_DIR/Dockerfile.aliyun"

echo "--- 安装 sqlite3 并初始化数据库 ---"
if ! command -v sqlite3 &>/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq sqlite3
fi

mkdir -p "$APP_DIR/.data"
if [ -f "$APP_DIR/.data/moontv.db" ]; then
  TABLE_COUNT=$(sqlite3 "$APP_DIR/.data/moontv.db" ".tables" 2>/dev/null | wc -w || echo 0)
  if [ "$TABLE_COUNT" -gt 5 ]; then
    echo "数据库已存在（$TABLE_COUNT 张表），跳过导入"
  else
    rm -f "$APP_DIR/.data/moontv.db"
    sqlite3 "$APP_DIR/.data/moontv.db" < /tmp/d1_remote_export.sql
  fi
else
  echo "导入 D1 数据到 SQLite..."
  sqlite3 "$APP_DIR/.data/moontv.db" < /tmp/d1_remote_export.sql
fi
echo "数据库就绪，共 $(sqlite3 $APP_DIR/.data/moontv.db '.tables' | wc -w) 张表"

echo "--- 配置 Docker 镜像加速 ---"
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'DAEMON_EOF'
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://mirror.ccs.tencentyun.com"
  ]
}
DAEMON_EOF
sudo systemctl reload docker 2>/dev/null || sudo systemctl restart docker
sleep 2

echo "--- 构建 Docker 镜像（需要几分钟）---"
cd "$APP_DIR"
sudo docker compose build --no-cache

echo "--- 启动服务 ---"
sudo docker compose down 2>/dev/null || true
sudo docker compose up -d

echo "--- 等待服务就绪 ---"
for i in $(seq 1 18); do
  if curl -sf http://localhost:3000 &>/dev/null; then
    echo "服务已就绪！"
    break
  fi
  echo "等待中... ($i/18)"
  sleep 10
done

echo ""
sudo docker compose ps
echo ""
echo "=== 部署完成 ==="
echo "访问地址: http://8.137.193.214:3000"
REMOTE_EOF

echo ""
echo "=== 本地操作完成 ==="
echo "访问地址: http://${SERVER}:3000"
