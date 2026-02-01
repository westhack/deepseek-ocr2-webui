#!/bin/bash

# ============================================
# E2E 测试稳定性验证脚本
# ============================================
# 用途：运行多次测试以验证稳定性
# 目标：50 次运行成功率 ≥95%

set -e

# 配置
TOTAL_RUNS=${1:-50}  # 默认运行 50 次，可通过参数修改
LOG_DIR="test-stability-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/stability_${TIMESTAMP}.log"
SUMMARY_FILE="${LOG_DIR}/stability_${TIMESTAMP}_summary.txt"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 创建日志目录
mkdir -p "$LOG_DIR"

# 初始化统计
PASSED=0
FAILED=0
FAILED_RUNS=()

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}E2E 测试稳定性验证${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "总运行次数: ${YELLOW}${TOTAL_RUNS}${NC}"
echo -e "日志文件: ${LOG_FILE}"
echo -e "汇总文件: ${SUMMARY_FILE}"
echo ""

# 开始时间
START_TIME=$(date +%s)

# 主循环
for i in $(seq 1 $TOTAL_RUNS); do
  echo -e "${BLUE}=== 运行 $i/$TOTAL_RUNS ===${NC}"
  
  # 运行测试并捕获输出
  RUN_START=$(date +%s)
  
  if npm run test:e2e >> "$LOG_FILE" 2>&1; then
    RUN_END=$(date +%s)
    DURATION=$((RUN_END - RUN_START))
    PASSED=$((PASSED + 1))
    echo -e "${GREEN}✅ 运行 $i 通过${NC} (耗时: ${DURATION}秒)"
    echo "✅ Run $i passed (Duration: ${DURATION}s)" >> "$LOG_FILE"
  else
    RUN_END=$(date +%s)
    DURATION=$((RUN_END - RUN_START))
    FAILED=$((FAILED + 1))
    FAILED_RUNS+=("$i")
    echo -e "${RED}❌ 运行 $i 失败${NC} (耗时: ${DURATION}秒)"
    echo "❌ Run $i FAILED (Duration: ${DURATION}s)" >> "$LOG_FILE"
    echo ""
    echo -e "${YELLOW}继续运行剩余测试...${NC}"
  fi
  
  # 显示当前统计
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.2f\", ($PASSED / $i) * 100}")
  echo -e "当前通过率: ${YELLOW}${SUCCESS_RATE}%${NC} ($PASSED/$i)"
  echo ""
  
  # 短暂延迟，避免资源竞争
  sleep 2
done

# 结束时间
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
MINUTES=$((TOTAL_DURATION / 60))
SECONDS=$((TOTAL_DURATION % 60))

# 计算最终通过率
FINAL_SUCCESS_RATE=$(awk "BEGIN {printf \"%.2f\", ($PASSED / $TOTAL_RUNS) * 100}")

# 生成汇总报告
{
  echo "========================================="
  echo "E2E 测试稳定性验证报告"
  echo "========================================="
  echo ""
  echo "运行时间: $(date)"
  echo "总运行次数: $TOTAL_RUNS"
  echo "通过次数: $PASSED"
  echo "失败次数: $FAILED"
  echo "成功率: ${FINAL_SUCCESS_RATE}%"
  echo "总耗时: ${MINUTES}分${SECONDS}秒"
  echo ""
  
  if [ $FAILED -gt 0 ]; then
    echo "失败的运行:"
    for run in "${FAILED_RUNS[@]}"; do
      echo "  - 运行 #$run"
    done
    echo ""
  fi
  
  echo "验收标准检查:"
  if (( $(echo "$FINAL_SUCCESS_RATE >= 95" | bc -l) )); then
    echo "  ✅ 成功率 ≥95%: 通过"
  else
    echo "  ❌ 成功率 ≥95%: 失败 (实际: ${FINAL_SUCCESS_RATE}%)"
  fi
  
  if [ $FAILED -eq 0 ]; then
    echo "  ✅ 没有随机失败: 通过"
  else
    echo "  ⚠️  存在失败: 需要分析原因"
  fi
  
  echo ""
  echo "详细日志: $LOG_FILE"
  echo "========================================="
} | tee "$SUMMARY_FILE"

# 显示最终结果
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}最终结果${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "通过: ${GREEN}$PASSED${NC} / $TOTAL_RUNS"
echo -e "失败: ${RED}$FAILED${NC} / $TOTAL_RUNS"
echo -e "成功率: ${YELLOW}${FINAL_SUCCESS_RATE}%${NC}"
echo -e "总耗时: ${MINUTES}分${SECONDS}秒"
echo ""

# 判断是否达到验收标准
if (( $(echo "$FINAL_SUCCESS_RATE >= 95" | bc -l) )); then
  echo -e "${GREEN}🎉 稳定性验证通过！${NC}"
  echo -e "${GREEN}成功率达到 95% 以上${NC}"
  exit 0
else
  echo -e "${RED}⚠️  稳定性验证未通过${NC}"
  echo -e "${RED}成功率低于 95%，需要优化测试稳定性${NC}"
  echo -e "${YELLOW}建议:${NC}"
  echo -e "  1. 查看失败日志: $LOG_FILE"
  echo -e "  2. 分析失败模式"
  echo -e "  3. 增加等待时间或重试次数"
  exit 1
fi
