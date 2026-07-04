#!/bin/bash
# MoonTVPlus 部署脚本 - 本地 Mac 构建镜像，上传到服务器运行
# 避免服务器内存不足导致构建 OOM
set -e

SERVER="8.137.193.214"
SERVER_USER="admin"
APP_DIR="/opt/moontvplus"
IMAGE_NAME="moontvplus:latest"
IMAGE_FILE="/tmp/moontvplus_image.tar"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== MoonTVPlus 部署 (本地构建) ==="
echo "提示：SSH/SCP 连接时请输入服务器密码 Zhangwei930."
echo ""

echo "1. 本地构建 Docker 镜像（约 5-10 分钟）..."
cd "$SCRIPT_DIR"
docker build -f Dockerfile.aliyun -t "$IMAGE_NAME" .
echo "✓ 镜像构建完成"

echo ""
echo "2. 导出镜像为 tar 文件..."
docker save "$IMAGE_NAME" -o "$IMAGE_FILE"
echo "✓ 镜像已导出到 $IMAGE_FILE ($(du -sh $IMAGE_FILE | cut -f1))"

echo ""
echo "3. 上传镜像和配置到服务器（需要输入密码）..."
scp -o StrictHostKeyChecking=no "$IMAGE_FILE" "${SERVER_USER}@${SERVER}:/tmp/moontvplus_image.tar"
scp -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/.env" \
  "${SERVER_USER}@${SERVER}:/tmp/"
echo "✓ 上传完成"

echo ""
echo "4. 在服务器上加载镜像并启动（需要输入密码）..."
ssh -o StrictHostKeyChecking=no -tt "${SERVER_USER}@${SERVER}" << 'REMOTE_EOF'
set -e

APP_DIR="/opt/moontvplus"

echo "--- 检查并安装 Docker ---"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo bash
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker admin
fi

echo "--- 准备目录和配置 ---"
sudo mkdir -p "$APP_DIR"
sudo chown admin:admin "$APP_DIR"
cp /tmp/docker-compose.yml "$APP_DIR/docker-compose.yml"
cp /tmp/.env "$APP_DIR/.env"

echo "--- 加载 Docker 镜像 ---"
sudo docker load -i /tmp/moontvplus_image.tar
echo "✓ 镜像加载完成"
rm -f /tmp/moontvplus_image.tar

echo "--- 确保数据目录存在 ---"
mkdir -p "$APP_DIR/.data"

echo "--- 重启服务 ---"
cd "$APP_DIR"
sudo docker compose down 2>/dev/null || true
sudo docker compose up -d

echo "--- 等待服务就绪 ---"
for i in $(seq 1 18); do
  if curl -sf http://localhost:3000/api/server-config &>/dev/null; then
    echo "✓ 服务已就绪"
    break
  fi
  echo "等待中... ($i/18)"
  sleep 10
done

echo ""
sudo docker compose ps
echo ""
echo "=== 部署完成 ==="
REMOTE_EOF

echo ""
echo "✓ 全部完成，清理本地临时文件..."
rm -f "$IMAGE_FILE"
echo "访问地址: https://tv.magies777.xyz"
