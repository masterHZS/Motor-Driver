#include "app_shared_data.h"
#include "app_power_switch.h"

/* 对应原 Core/Src/shared_data.c，逐行照搬 */

/* ===== 显示 / 菜单 状态 ===== */
volatile MenuMode_t g_menu_mode = MENU_SPLASH;
volatile uint8_t g_menu_index = 0;
volatile uint8_t g_menu_scroll = 0;
volatile uint8_t g_sub_index = 0;

/* display current page (legacy) */
volatile uint8_t g_display_page = 0;

/* ===== 状态区 ===== */
volatile AdcStatus_t g_adc_status = {0};

/* ===== 目标参数 ===== */
AdjTarget_t g_adj_target = {
    .adj1_set_v = 0.0f,
    .adj2_set_v = 0.0f
};

/* ===== PWM 命令 ===== */
volatile PwmCmd_t g_pwm_cmd = {0};

/* ===== PP / MOS 状态缓存 ===== */
volatile uint8_t g_pp_state[3]  = { PP_HIZ, PP_HIGH, PP_HIGH }; /* PushPullState_t 常量值 (0..2) */
volatile uint8_t g_mos_state[3] = { 1, 1, 0 };                  /* 1 = ON */
