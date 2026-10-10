###############################################################################
# Fire-072 —— HC32F072JATA 数控 DCDC 电源固件  GCC Makefile
#
# 来源：把 Fire-Ctrl/Simple_DCDC（STM32F103C8T6 + HAL + FreeRTOS）
#       复刻到 HC32F072JATA（XHSC DDL + 自带轻量内核）
#
# MCU  : HC32F072JATA (ARM Cortex-M0+, LQFP48, 128KB Flash, 16KB RAM)
# IDE  : VS Code
# Link : DAPLink (CMSIS-DAP) + pyOCD
#
# 使用方法:
#   make            - 编译并生成 build/fire072.elf/.hex/.bin
#   make clean      - 清理编译产物
#   make flash      - 通过 pyOCD 烧录
#   make size       - 查看固件大小
#
# 目录结构（沿用 STM32CubeIDE 的习惯，便于和原工程对照）:
#   Core/Src   Core/Inc   Core/u8g2   core/   drivers/   cmsis/   ldscripts/
###############################################################################

TARGET   := fire072
BUILD    := build

###############################################################################
# 工具链
###############################################################################
CROSS   ?= arm-none-eabi-

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
CMSIS_DIR  := cmsis
LDS_DIR    := ldscripts
APP_SRC_DIR := Core/Src
APP_INC_DIR := Core/Inc
U8G2_DIR    := Core/u8g2
LDSCRIPT   := $(LDS_DIR)/hc32f072.ld

###############################################################################
# 源文件
###############################################################################
CORE_SRC   := $(CORE_DIR)/startup_hc32f072.s \
              $(CORE_DIR)/system_hc32f072.c \
              $(CORE_DIR)/interrupts_hc32f072.c \
              $(CORE_DIR)/syscalls.c

DRV_SRC    := $(wildcard $(DRV_DIR)/src/*.c)
APP_SRC    := $(wildcard $(APP_SRC_DIR)/*.c)
U8G2_SRC   := $(wildcard $(U8G2_DIR)/*.c)

ALL_SRC    := $(CORE_SRC) $(DRV_SRC) $(APP_SRC) $(U8G2_SRC)
ALL_OBJ    := $(addprefix $(BUILD)/,$(notdir $(patsubst %.s,%.o,$(patsubst %.c,%.o,$(ALL_SRC)))))

# 让 make 在子目录中查找源文件（用于扁平化输出目录）
vpath %.c $(CORE_DIR) $(DRV_DIR)/src $(APP_SRC_DIR) $(U8G2_DIR)
vpath %.s $(CORE_DIR)

###############################################################################
# 编译参数
###############################################################################
CPU_FLAGS  := -mcpu=cortex-m0plus -mthumb -mfloat-abi=soft

# -Os 而非 -Og：u8g2 全量字体表很大，靠 --gc-sections 只保留用到的字体，
# 但 -Os 能进一步把 Flash 占用压下来（128KB 里要留余量）。
INCLUDES   := -I$(CORE_DIR) -I$(DRV_DIR)/inc -I$(CMSIS_DIR) \
              -I$(APP_INC_DIR) -I$(U8G2_DIR)

CFLAGS     := $(CPU_FLAGS) \
              -Os -g3 -gdwarf-2 \
              -Wall -Wextra \
              -ffunction-sections -fdata-sections \
              -std=c99 \
              $(INCLUDES)

CFLAGS     += -Wno-unused-parameter
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
	@echo "======================================================"

$(BUILD):
	@$(MKDIR_CMD) $(BUILD)

$(BUILD)/%.o: %.s | $(BUILD)
	@echo "  AS  $<"
	@$(AS) $(ASFLAGS) -c $< -o $@

$(BUILD)/%.o: %.c | $(BUILD)
	@echo "  CC  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/$(TARGET).elf: $(ALL_OBJ)
	@echo "  LD  $@"
	@$(LD) $(LDFLAGS) -o $@ $(ALL_OBJ)
	@$(SIZE) $@

$(BUILD)/$(TARGET).hex: $(BUILD)/$(TARGET).elf
	@$(OBJCOPY) -O ihex $< $@

$(BUILD)/$(TARGET).bin: $(BUILD)/$(TARGET).elf
	@$(OBJCOPY) -O binary $< $@

size: $(BUILD)/$(TARGET).elf
	@$(SIZE) $<

PYOCD    ?= pyocd

flash: all
	$(PYOCD) flash -t hc32f072 $(BUILD)/$(TARGET).hex

debug:
	$(PYOCD) gdbserver -t hc32f072 -f 1000000

clean:
	@echo "  CLEAN"
	@-$(RM_CMD) $(BUILD) 2>NUL
