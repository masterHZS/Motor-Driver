#ifndef SHARED_DATA_H_
#define SHARED_DATA_H_

#include <stdint.h>
#include "os_api.h"

/*
 * Fire-072 / shared_data.h
 * 对应原 Fire-Ctrl/Simple_DCDC/Core/Inc/shared_data.h
 * 唯一改动：cmsis_os.h -> os_api.h（自带的轻量内核，见 os_api.h 的说明）
 */

//display pages (legacy pages for ADJ monitor/control)
#define DISPLAY_NUM_PAGES         2U
extern volatile uint8_t g_display_page;

/* ===================== */
/* ===== 状态数据 ===== */
/* ===================== */

/* ADC / 测量结果单位是V，由ADC_Task自动转换成伏特 */
typedef struct {
    float hv_common;      /* AIN0  PA0 */
    float hv_df1;         /* AIN1  PA1 */
    float hv_df2;         /* AIN2  PA2 */
    float vref_ext;       /* AIN3  PA3  (2.5V 标定) */
    float adj1_fb;        /* AIN4  PA4 */
    float adj2_fb;        /* AIN5  PA5 */
    float vin_24v;        /* AIN9  PB1 (VCC_MONITOR) */
    float vin_3v3;        /* LDO voltage for controller */
} AdcStatus_t;

extern volatile AdcStatus_t g_adc_status;


/* ===================== */
/* === 控制目标区 ===== */
/* ===================== */

typedef struct {
    float adj1_set_v;
    float adj2_set_v;
} AdjTarget_t;

extern AdjTarget_t g_adj_target;
extern osMutexId_t ADJSetMutexHandle;


/* ===================== */
/* ====== PWM 命令 ===== */
/* ===================== */

typedef struct {
    uint16_t pwm1;   /* 0~ARR */
    uint16_t pwm2;
} PwmCmd_t;

extern volatile PwmCmd_t g_pwm_cmd;


/* ===================== */
/* ===== 菜单 / UI ===== */
/* ===================== */

/* 可见主菜单行数（9x15 字高 ≈15，屏高64，大约能显示 3 行）*/
#define MENU_VISIBLE_LINES 3
#define MENU_MAIN_ITEMS 5

typedef enum {
    MENU_SPLASH = 0,
    MENU_MAIN,
    MENU_SUB_ADJ,     /* ADJ 输出选择（ADJ1 / ADJ2）*/
    MENU_ADJ_CONTROL, /* 实际 ADJ1/ADJ2 控制页面（兼容原 g_display_page）*/
    MENU_PP_HB,
    MENU_MOS,
    MENU_VCC,
    MENU_HV
} MenuMode_t;

extern volatile MenuMode_t g_menu_mode;
extern volatile uint8_t g_menu_index;    /* 在当前菜单中的选中索引 */
extern volatile uint8_t g_menu_scroll;   /* 主菜单滚动 offset */
extern volatile uint8_t g_sub_index;     /* 子菜单选择索引 */

/* PP half-bridge states cache (映射到 PushPullState_t) */
extern volatile uint8_t g_pp_state[3];   /* 0: HiZ, 1: Low, 2: High */

/* MOS states cache (映射到 MosState_t) */
extern volatile uint8_t g_mos_state[3];  /* 0: OFF, 1: ON */


/* ===================== */
/* ===== 事件定义 ===== */
/* ===================== */

#define EVT_ADJ_TARGET_UPDATED   (1U << 0)
#define EVT_POWER_REG_UPDATED    (1U << 1)
#define EVT_ADC_UPDATED          (1U << 2)
#define EVT_PAGE_CHANGED         (1U << 3)
#define EVT_UI_REDRAW            (1U << 4)

extern osEventFlagsId_t sysEventFlagsHandle;

typedef enum {
    BTN_EVENT_PRESS = 0,
    BTN_EVENT_RELEASE
} BtnEventType_t;

typedef struct {
    uint8_t  key_id;   /* 哪个键 */
    uint8_t  type;     /* PRESS / RELEASE */
    uint16_t reserved; /* 对齐 */
    uint32_t tick;     /* 时间戳 (RTOS tick) */
} BtnEvent_t;

#endif /* SHARED_DATA_H */
