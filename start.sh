#!/usr/bin/env bash
#
# FreeReport 随手报 — 一键启动脚本
# 用法: ./start.sh
#
# 自动完成: JDK17 检测 → MySQL 检测 → 端口清理 → 后端构建启动 → 前端启动 → 健康检查
#

set -euo pipefail

# ─── 配置 ───────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/server-springboot"
FRONTEND_PORT=3000
BACKEND_PORT=3001
JAR_NAME="free-report-server-1.0.0.jar"
HEALTH_TIMEOUT=30  # 秒

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

# ─── 清理函数 ───────────────────────────────────────────
cleanup() {
  echo ""
  warn "收到退出信号，正在关闭服务..."
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null && info "后端已停止"
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null && info "前端已停止"
  ok "再见！"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─── 1. JDK 17 检测 ─────────────────────────────────────
info "检测 JDK 17..."

if [[ -n "${JAVA_HOME:-}" ]] && "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '17'; then
  : # 已设置且正确
else
  # 按优先级探测常见安装路径
  for candidate in \
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home" \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home"; do
    if [[ -x "$candidate/bin/java" ]] && "$candidate/bin/java" -version 2>&1 | grep -q '17'; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

if [[ -z "${JAVA_HOME:-}" ]] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '17'; then
  fail "未找到 JDK 17，请安装: brew install openjdk@17"
fi
export PATH="$JAVA_HOME/bin:$PATH"
ok "JDK 17: $JAVA_HOME"

# ─── 2. Maven 检测 ──────────────────────────────────────
if ! command -v mvn &>/dev/null; then
  fail "未找到 mvn，请安装: brew install maven"
fi
ok "Maven: $(mvn -v 2>/dev/null | head -1)"

# ─── 3. MySQL 检测 ──────────────────────────────────────
info "检测 MySQL..."
if command -v mysqladmin &>/dev/null; then
  if mysqladmin ping -h localhost --silent 2>/dev/null; then
    ok "MySQL 运行中"
  else
    warn "MySQL 未运行，尝试启动..."
    brew services start mysql 2>/dev/null || fail "MySQL 启动失败，请手动启动: brew services start mysql"
    sleep 3
    mysqladmin ping -h localhost --silent 2>/dev/null && ok "MySQL 已启动" || fail "MySQL 仍无响应"
  fi
else
  warn "未找到 mysqladmin，跳过检测（请确保 MySQL 已运行）"
fi

# ─── 4. 端口清理 ────────────────────────────────────────
info "清理端口 $FRONTEND_PORT / $BACKEND_PORT 上的残留进程..."
for port in $FRONTEND_PORT $BACKEND_PORT; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    warn "端口 $port 被 PID $pids 占用，正在清理..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done
ok "端口已就绪"

# ─── 5. 加载环境变量 ────────────────────────────────────
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  info "加载 .env 环境变量..."
  set -a
  # shellcheck disable=SC1090
  source "$PROJECT_ROOT/.env"
  set +a
fi

# ─── 6. 构建并启动后端 ──────────────────────────────────
JAR_PATH="$BACKEND_DIR/target/$JAR_NAME"

if [[ ! -f "$JAR_PATH" ]]; then
  info "首次启动，构建 Spring Boot 后端（约 10 秒）..."
  (cd "$BACKEND_DIR" && mvn clean package -DskipTests -q) || fail "后端构建失败"
  ok "后端构建完成"
else
  info "后端 JAR 已存在，跳过构建（如需重新构建请删除 target/ 目录）"
fi

info "启动 Spring Boot 后端 (port $BACKEND_PORT)..."
cd "$BACKEND_DIR"
nohup java -jar "$JAR_PATH" > /tmp/freereport-backend.log 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"
info "后端 PID: $BACKEND_PID"

# ─── 7. 启动前端 ────────────────────────────────────────
info "启动 Vite 前端 (port $FRONTEND_PORT)..."
cd "$PROJECT_ROOT"
nohup npx vite --port "$FRONTEND_PORT" --strictPort > /tmp/freereport-frontend.log 2>&1 &
FRONTEND_PID=$!
info "前端 PID: $FRONTEND_PID"

# ─── 8. 健康检查 ────────────────────────────────────────
info "等待服务就绪（最多 ${HEALTH_TIMEOUT}s）..."

backend_ok=false
frontend_ok=false
elapsed=0

while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
  if [[ "$backend_ok" == false ]]; then
    if curl -sf --max-time 2 "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
      backend_ok=true
      ok "后端就绪 ✓"
    fi
  fi
  if [[ "$frontend_ok" == false ]]; then
    if curl -sf --max-time 2 -o /dev/null "http://localhost:$FRONTEND_PORT/" 2>&1; then
      frontend_ok=true
      ok "前端就绪 ✓"
    fi
  fi
  if [[ "$backend_ok" == true && "$frontend_ok" == true ]]; then
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

# ─── 9. 结果汇报 ────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  随手报 ReportNow 已启动 ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""

if [[ "$frontend_ok" == true ]]; then
  echo -e "  ${BLUE}前端${NC}  http://localhost:$FRONTEND_PORT"
else
  echo -e "  ${RED}前端${NC}  启动超时，查看日志: cat /tmp/freereport-frontend.log"
fi

if [[ "$backend_ok" == true ]]; then
  echo -e "  ${BLUE}后端${NC}  http://localhost:$BACKEND_PORT/api/health"
else
  echo -e "  ${RED}后端${NC}  启动超时，查看日志: cat /tmp/freereport-backend.log"
fi

echo ""
echo -e "  ${YELLOW}测试账号${NC}（密码均为 123456）:"
echo -e "    hq_admin      总部报表管理员"
echo -e "    admin         超级管理员"
echo -e "    bj_handler    北京经办人"
echo -e "    bj_reviewer   北京复核人"
echo ""
echo -e "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 保持前台运行，等待用户退出
wait
