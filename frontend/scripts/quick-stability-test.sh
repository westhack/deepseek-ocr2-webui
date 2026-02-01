#!/bin/bash

# ============================================
# E2E 测试快速稳定性验证脚本
# ============================================
# 用途：运行 10 次测试快速验证稳定性
# 适用于开发阶段的快速验证

set -e

# 配置
TOTAL_RUNS=10
LOG_DIR="test-stability-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/quick_stability_${TIMESTAMP}.log"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 创建日志目录
mkdir -p "$LOG_DIR"

# 初始化统计
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}E2E 快速稳定性验证 (10次)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

START_TIME=$(date +%s)

for i in $(seq 1 $TOTAL_RUNS); do
  echo -e "${BLUE}=== 运行 $i/$TOTAL_RUNS ===${NC}"
  
  if npm run test:e2e >> "$LOG_FILE" 2>&1; then
    PASSED=$((PASSED + 1))
    echo -e "${GREEN}✅ 运行 $i 通过${NC}"
  else
    FAILED=$((FAILED + 1))
    echo -e "${RED}❌ 运行 $i 失败${NC}"
  fi
  
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED / $i) * 100}")
  echo -e "当前通过率: ${YELLOW}${SUCCESS_RATE}%${NC} ($PASSED/$i)"
  echo ""
  
  sleep 1
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

FINAL_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED / $TOTAL_RUNS) * 100}")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}最终结果${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "通过: ${GREEN}$PASSED${NC} / $TOTAL_RUNS"
echo -e "失败: ${RED}$FAILED${NC} / $TOTAL_RUNS"
echo -e "成功率: ${YELLOW}${FINAL_RATE}%${NC}"
echo -e "总耗时: ${MINUTES}分${SECONDS}秒"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 所有测试通过！${NC}"
else
  echo -e "${YELLOW}⚠️  有 $FAILED 次失败，查看日志: $LOG_FILE${NC}"
fi
