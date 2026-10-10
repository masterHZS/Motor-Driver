###############################################################################
# HC32F072JATA  GCC Makefile
#
# MCU  : HC32F072JATA (ARM Cortex-M0+, LQFP48, 128KB Flash, 16KB RAM)
# IDE  : VS Code (tasks.json / launch.json 调用本 Makefile)
# Link : DAPLink (CMSIS-DAP) + pyOCD
#
# 使用方法:
#   make            - 编译并生成 build/hc32f072.elf/.hex/.bin
#   make clean      - 清理编译产物
#   make flash      - 通过 pyOCD 烧录 (需安装 pyocd 并连接 DAPLink)
#   make debug      - 启动 pyOCD GDB Server (配合 launch.json 调试)
#   make size       - 查看固件大小
###############################################################################

TARGET   := hc32f072
BUILD    := build

###############################################################################
# 工具链: 请确保 arm-none-eabi-gcc 在 PATH 中
# 如果工具链未加入 PATH，可在此指定绝对路径，例如:
# CROSS   := C:/Users/28572/Desktop/toolchain/gcc-arm-none-eabi-10.3-2021.10/bin/arm-none-eabi-
###############################################################################
CROSS   ?= arm-none-eabi-

# 自动查找本地 .toolchain 目录中的工具链 (当 PATH 中没有 arm-none-eabi-gcc 时)
ifeq ($(OS),Windows_NT)
    GCC_ON_PATH := $(shell where arm-none-eabi-gcc 2>NUL)
    ifeq ($(GCC_ON_PATH),)
        LOCAL_GCC := $(firstword $(wildcard .toolchain/xpack-arm-none-eabi-gcc-*/bin/arm-none-eabi-gcc.exe))
        ifneq ($(LOCAL_GCC),)
            CROSS := $(patsubst %gcc.exe,%,$(LOCAL_GCC))
        endif
    endif
endif

CC       = $(CROSS)gcc
AS       = $(CROSS)gcc
LD       = $(CROSS)gcc
OBJCOPY  = $(CROSS)objcopy
OBJDUMP  = $(CROSS)objdump
SIZE     = $(CROSS)size
GDB      = $(CROSS)gdb

###############################################################################
# 目录
###############################################################################
CORE_DIR   := core
DRV_DIR    := drivers
USER_DIR   := user
ADD_DIR    := additional
CMSIS_DIR  := cmsis
LDSCRIPT   := ldscripts/hc32f072.ld

###############################################################################
# 源文件
###############################################################################
CORE_SRC   := $(CORE_DIR)/startup_hc32f072.s \
              $(CORE_DIR)/system_hc32f072.c \
              $(CORE_DIR)/interrupts_hc32f072.c \
              $(CORE_DIR)/syscalls.c

DRV_SRC    := $(wildcard $(DRV_DIR)/src/*.c)
USER_SRC   := $(wildcard $(USER_DIR)/*.c)
ADD_SRC    := $(wildcard $(ADD_DIR)/*.c)

ALL_SRC    := $(CORE_SRC) $(DRV_SRC) $(USER_SRC) $(ADD_SRC)
ALL_OBJ    := $(addprefix $(BUILD)/,$(notdir $(patsubst %.s,%.o,$(patsubst %.c,%.o,$(ALL_SRC)))))

# 让 make 在子目录中查找源文件 (用于扁平化输出目录)
vpath %.c $(CORE_DIR) $(DRV_DIR)/src $(USER_DIR) $(ADD_DIR)
vpath %.s $(CORE_DIR)

###############################################################################
# 编译参数
###############################################################################
CPU_FLAGS  := -mcpu=cortex-m0plus -mthumb -mfloat-abi=soft

INCLUDES   := -I$(CORE_DIR) -I$(DRV_DIR)/inc -I$(USER_DIR) -I$(ADD_DIR) -I$(CMSIS_DIR)

CFLAGS     := $(CPU_FLAGS) \
              -Og -g3 -gdwarf-2 \
              -Wall -Wextra \
              -ffunction-sections -fdata-sections \
              -std=c99 \
              $(INCLUDES)

# 可选: 禁用编译器对未使用参数的告警 (DDL 库函数参数)
CFLAGS     += -Wno-unused-parameter
# DDL 官方示例使用 int32_t main(void), 抑制对应告警
CFLAGS     += -Wno-main
# DDL 库源码中 pca.c/vc.c 等存在官方自带的 maybe-uninitialized 告警, 抑制
CFLAGS     += -Wno-maybe-uninitialized

ASFLAGS    := $(CPU_FLAGS) \
              -x assembler-with-cpp \
              $(INCLUDES)

LDFLAGS    := $(CPU_FLAGS) \
              -T $(LDSCRIPT) \
              -Wl,--gc-sections \
              -Wl,-Map=$(BUILD)/$(TARGET).map \
              -Wl,--no-warn-rwx-segments \
              --specs=nano.specs \
              -Wl,--start-group -lc -lm -Wl,--end-group

###############################################################################
# 目标规则
###############################################################################
.PHONY: all clean flash debug size

# 跨平台目录/删除命令
ifeq ($(OS),Windows_NT)
    MKDIR_CMD := mkdir
    RM_CMD    := rmdir /s /q
else
    MKDIR_CMD := mkdir -p
    RM_CMD    := rm -rf
endif

all: $(BUILD)/$(TARGET).elf $(BUILD)/$(TARGET).hex $(BUILD)/$(TARGET).bin
	@echo ""
	@echo "======================================================"
	@echo "  Build OK: $(TARGET).elf/.hex/.bin"
	@echo "  Flash    : make flash   (DAPLink via pyOCD)"
	@echo "  Debug    : make debug   (pyOCD GDB Server)"
	@echo "======================================================"

$(BUILD):
	@$(MKDIR_CMD) $(BUILD)

# 汇编启动文件
$(BUILD)/%.o: %.s | $(BUILD)
	@echo "  AS  $<"
	@$(AS) $(ASFLAGS) -c $< -o $@

# C 源文件
$(BUILD)/%.o: %.c | $(BUILD)
	@echo "  CC  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/$(TARGET).elf: $(ALL_OBJ)
	@echo "  LD  $@"
	@$(LD) $(LDFLAGS) -o $@ $(ALL_OBJ)
	@$(SIZE) $@

$(BUILD)/$(TARGET).hex: $(BUILD)/$(TARGET).elf
	@echo "  OBJCOPY $@"
	@$(OBJCOPY) -O ihex $< $@

$(BUILD)/$(TARGET).bin: $(BUILD)/$(TARGET).elf
	@echo "  OBJCOPY $@"
	@$(OBJCOPY) -O binary $< $@

$(BUILD)/$(TARGET).dis: $(BUILD)/$(TARGET).elf
	@echo "  OBJDUMP $@"
	@$(OBJDUMP) -d -S $< > $@

size: $(BUILD)/$(TARGET).elf
	@$(SIZE) $<

###############################################################################
# 烧录 & 调试 (pyOCD + DAPLink)
# 注意: 目标名为 hc32f072 (pyOCD 内置 HDSC HC32F072 支持)
# 可用:  make flash PYOCD="python -m pyocd"  (当 pyocd 不在 PATH 时)
###############################################################################
PYOCD    ?= pyocd

flash: all
	$(PYOCD) flash -t hc32f072 $(BUILD)/$(TARGET).hex

debug:
	$(PYOCD) gdbserver -t hc32f072 -f 1000000

clean:
	@echo "  CLEAN"
	@-$(RM_CMD) $(BUILD) 2>NUL
