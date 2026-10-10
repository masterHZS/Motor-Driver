/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    freertos.c
  * @brief   Fire-072 任务实现 —— 对应原 Core/Src/freertos.c
  *
  * 【与 FreeRTOS 版本的关系】
  *   任务划分、优先级、控制算法、格式化逻辑全部保留原样；
  *   只把 cmsis_os.h 换成自带的 os_api.h（见 os_api.h 顶部的说明），
  *   以及把 HAL 的 PWM/DMA 调用换成 F072 的 DDL 调用。
  *
  * 【任务与优先级】
  *   ADCTask     prio 4  每 1ms 采一次，每 16ms 滤波输出
  *   ControlTask prio 4  10ms 控制环
  *   ButtonTask  prio 3  阻塞等按键事件
  *   DisplayTask prio 2  最低优先级，靠抢占自然限帧
  *   defaultTask prio 3  占位
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "os_api.h"
#include "board.h"

/* Private includes ----------------------------------------------------------*/
#include "app_power_switch.h"
#include "app_shared_data.h"
#include "app_adc.h"
#include "app_tim.h"
#include "app_i2c.h"
#include "app_led.h"
#include "u8g2.h"
#include <string.h>
#include <stdbool.h>
#include <math.h>

/* ==========================================================================
 * 数控电源参数
 * ========================================================================== */

/* 输出级：Vout = PSU_GAIN_OUT * Vref_equiv
 * 注：原工程的 8.0f 是按它自己那块板写的；本板 RT8289 的分压比是
 *     (30k+1.8k)/1.8k = 17.667，再由 LM358 参考通道放大，
 *     实际"PWMIN 直流电压 -> 输出电压"是反向的 35.3 倍。
 *     所以这里不再用 PSU_GAIN_OUT 做前馈，改用下面两个标定常数，
 *     详见 README「控制电压原理」一节。                              */
#define PSU_GAIN_OUT              (8.0f)          /* 仅保留供对照 */

/* 反馈分压：Vfb = Vout * (R_BOT / (R_TOP + R_BOT)) */
#define FB_R_TOP_OHM              (30000.0f)
#define FB_R_BOT_OHM              (1800.0f)

/* ADC 量化 */
#define ADC_FULL_SCALE_F          (4096.0f)

/* 标定电压 */
#define VREF_CAL_VOLT             (2.500f)

/* 前馈标定：Vout ≈ -DCDC_PWM_GAIN_V_PER_V * (Vpwm - DCDC_PWM_OFFSET_V)
 * 本板网表反推值（R1=R2=R3=10k, R4=28k, R5=4.02k）：
 *   DCDC_PWM_GAIN_V_PER_V = 35.3
 *   DCDC_PWM_OFFSET_V     = 39.6
 * 上电后请用万用表实测两点（例如 D=0.5 与 D=0.6 对应的输出电压）
 * 重新拟合这两个数，否则前馈不准，只能靠积分慢慢补。               */
#define DCDC_PWM_GAIN_V_PER_V     (35.3f)
#define DCDC_PWM_OFFSET_V         (39.6f)

/* 电池/母线上限保护（Vout 超过 VSET + 此值就回卷积分） */
#define OV_TRIP_MARGIN_V          (1.5f)

/* 控制周期（ControlTask） */
#define CTRL_PERIOD_MS            (10U)
#define CTRL_DT_S                 (0.010f)

/* 积分参数（前馈 + 慢积分补偿） */
#define CTRL_KI                   (0.25f)
#define INTEG_LIMIT               (0.25f)

/* Duty 限幅 */
#define DUTY_MIN                  (0.0f)
#define DUTY_MAX                  (1.0f)

/* ADC 低通滤波 EMA alpha */
#define ADC_EMA_ALPHA             (0.05f)

/* ==========================================================================
 * 共享量
 * ========================================================================== */
static volatile float s_vset_v  = 12.0f;   /* 设定输出电压 ADJ1 */
static volatile float s_vset2_v = 0.0f;    /* 设定输出电压 ADJ2 */
static volatile float s_vout_v  = 0.0f;    /* 测得输出电压 */
static volatile float s_vfb_v   = 0.0f;    /* 测得反馈点电压 */
static volatile float s_vdda_v  = 3.30f;   /* 推算的 VDDA */
static volatile float s_duty_cmd  = 0.0f;  /* 最终输出占空比 ADJ1 */
static volatile float s_duty2_cmd = 0.0f;  /* 最终输出占空比 ADJ2 */

/* EMA 状态：原工程对【ADC 原码】做 EMA，这里保留同样做法 */
static float    s_ema_v25_adc;
static float    s_ema_vfb_adc;
static float    s_ema_vfb2_adc;
static uint32_t s_ema_acc;                  /* 原码累加器，提高有效分辨率 */
static uint16_t s_ema_cnt;

/* 控制积分项 */
static float s_integ;
static float s_integ2;

/* ==========================================================================
 * 任务栈：单位是【字节】。原 CubeMX 配置写的是 1024*4 等，
 * 那是把"字"当"字节"了；16KB RAM 的 F072 上按实际需要重新分配。
 * ========================================================================== */
static uint32_t s_stack_default[128 / 4];
static uint32_t s_stack_adc[512 / 4];
static uint32_t s_stack_ctrl[256 / 4];
static uint32_t s_stack_button[256 / 4];
static uint32_t s_stack_display[640 / 4];

osThreadId_t defaultTaskHandle;
osThreadId_t ADCTaskHandle;
osThreadId_t ControlTaskHandle;
osThreadId_t ButtonTaskHandle;
osThreadId_t DisplayTaskHandle;
osMessageQueueId_t buttonQueueHandle;
osMutexId_t ADJSetMutexHandle;
osEventFlagsId_t sysEventFlagsHandle;
/* 原工程有个 adcDmaSem 信号量给 DMA 完成中断用；F072 上是 DMAC 循环搬运，
 * ADCTask 按 1ms 定时读缓冲即可，不再需要这个信号量。*/

/* ==========================================================================
 * 工具
 * ========================================================================== */
static inline float clampf(float x, float lo, float hi)
{
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
}

static inline float ema_update(float prev, float x, float a)
{
    return prev + a * (x - prev);
}

void StartDefaultTask(void *argument);
void StartADCTask(void *argument);
void StartControlTask(void *argument);
void StartButtonTask(void *argument);
void StartDisplayTask(void *argument);

/* ==========================================================================
 * 初始化
 * ========================================================================== */
void MX_FREERTOS_Init(void)
{
    static const osMutexAttr_t ADJSetMutex_attributes = { "ADJSetMutex", 0u, 0, 0u };
    static const osMessageQueueAttr_t buttonQueue_attributes = { "buttonQueue", 0u, 0, 0u };
    static const osEventFlagsAttr_t sysEventFlags_attributes = { "sysEventFlags", 0u, 0, 0u };

    static const osThreadAttr_t defaultTask_attributes = {
        "defaultTask", 0u, 0, 0u, s_stack_default, sizeof(s_stack_default),
        osPriorityNormal, 0u, 0u
    };
    static const osThreadAttr_t ADCTask_attributes = {
        "ADCTask", 0u, 0, 0u, s_stack_adc, sizeof(s_stack_adc),
        osPriorityAboveNormal, 0u, 0u
    };
    static const osThreadAttr_t ControlTask_attributes = {
        "ControlTask", 0u, 0, 0u, s_stack_ctrl, sizeof(s_stack_ctrl),
        osPriorityAboveNormal, 0u, 0u
    };
    static const osThreadAttr_t ButtonTask_attributes = {
        "ButtonTask", 0u, 0, 0u, s_stack_button, sizeof(s_stack_button),
        osPriorityNormal, 0u, 0u
    };
    static const osThreadAttr_t DisplayTask_attributes = {
        "DisplayTask", 0u, 0, 0u, s_stack_display, sizeof(s_stack_display),
        osPriorityBelowNormal, 0u, 0u
    };

    ADJSetMutexHandle   = osMutexNew(&ADJSetMutex_attributes);
    buttonQueueHandle   = osMessageQueueNew(8u, 8u, &buttonQueue_attributes);
    sysEventFlagsHandle = osEventFlagsNew(&sysEventFlags_attributes);

    defaultTaskHandle = osThreadNew(StartDefaultTask, 0, &defaultTask_attributes);
    ADCTaskHandle     = osThreadNew(StartADCTask, 0, &ADCTask_attributes);
    ControlTaskHandle = osThreadNew(StartControlTask, 0, &ControlTask_attributes);
    ButtonTaskHandle  = osThreadNew(StartButtonTask, 0, &ButtonTask_attributes);
    DisplayTaskHandle = osThreadNew(StartDisplayTask, 0, &DisplayTask_attributes);
}

/* ==========================================================================
 * defaultTask
 * ========================================================================== */
void StartDefaultTask(void *argument)
{
    (void)argument;
    for (;;) {
        osDelay(1000u);
    }
}

/* ==========================================================================
 * ADCTask
 *   - DMA 循环把 7 个通道搬到 adc_buffer
 *   - 用 PA3 的 2.5V 标定反推 VDDA
 *   - 用 PA4/PA5 的 FB 分压算 Vout
 *   - 原码做 EMA 滤波
 * ========================================================================== */
void StartADCTask(void *argument)
{
    float a25, afb, afb2;

    (void)argument;

    /* 等第一轮 DMA 填满缓冲 */
    osDelay(50u);

    /* 初始化 EMA 为当前值，避免启动跳变 */
    s_ema_v25_adc  = (float)adc_buffer[BOARD_ADC_IDX_V2P5];
    s_ema_vfb_adc  = (float)adc_buffer[BOARD_ADC_IDX_ADJ1_FB];
    s_ema_vfb2_adc = (float)adc_buffer[BOARD_ADC_IDX_ADJ2_FB];
    s_ema_acc = 0u;
    s_ema_cnt = 0u;

    for (;;) {
        float vdda, vfb, vout;

        /* 取本次 DMA 缓冲的原始码，并累加做 16 点平均 */
        a25  = (float)adc_buffer[BOARD_ADC_IDX_V2P5];
        afb  = (float)adc_buffer[BOARD_ADC_IDX_ADJ1_FB];
        afb2 = (float)adc_buffer[BOARD_ADC_IDX_ADJ2_FB];

        s_ema_acc += (uint32_t)adc_buffer[BOARD_ADC_IDX_ADJ1_FB];
        s_ema_cnt++;
        if (s_ema_cnt >= 16u) {
            afb = (float)s_ema_acc / 16.0f;   /* 16 点平均，+2bit 有效位 */
            s_ema_acc = 0u;
            s_ema_cnt = 0u;

            /* EMA 滤波（对 ADC 原码做，与原工程一致） */
            s_ema_v25_adc  = ema_update(s_ema_v25_adc, a25, ADC_EMA_ALPHA);
            s_ema_vfb_adc  = ema_update(s_ema_vfb_adc, afb, ADC_EMA_ALPHA);
            s_ema_vfb2_adc = ema_update(s_ema_vfb2_adc, afb2, ADC_EMA_ALPHA);
        }

        /* 用 2.5V 推算 VDDA（ADC 参考/供电） */
        vdda = s_vdda_v;
        if (s_ema_v25_adc > 1.0f) {
            vdda = VREF_CAL_VOLT * (ADC_FULL_SCALE_F / s_ema_v25_adc);
        }
        vdda = clampf(vdda, VDDA_MIN_V, VDDA_MAX_V);

        /* 计算 Vfb / Vout */
        vfb  = (s_ema_vfb_adc / ADC_FULL_SCALE_F) * vdda;
        vout = vfb * ((FB_R_TOP_OHM + FB_R_BOT_OHM) / FB_R_BOT_OHM);

        /* 写共享数据 */
        if (osMutexAcquire(ADJSetMutexHandle, 5u) == osOK) {
            s_vdda_v = vdda;
            s_vfb_v  = vfb;
            s_vout_v = vout;
            (void)osMutexRelease(ADJSetMutexHandle);
        } else {
            s_vdda_v = vdda;
            s_vfb_v  = vfb;
            s_vout_v = vout;
        }

        /* 顺便把对外暴露的测量结构填上（ui.c / input.c 用得到） */
        g_adc_status.vref_ext = (s_ema_v25_adc / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.adj1_fb  = vfb;
        g_adc_status.adj2_fb  = (s_ema_vfb2_adc / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.hv_common = ((float)adc_buffer[BOARD_ADC_IDX_HVSE] / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.hv_df1    = ((float)adc_buffer[BOARD_ADC_IDX_HVDF1] / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.hv_df2    = ((float)adc_buffer[BOARD_ADC_IDX_HVDF2] / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.vin_24v   = ((float)adc_buffer[BOARD_ADC_IDX_VCC_MON] / ADC_FULL_SCALE_F) * vdda;
        g_adc_status.vin_3v3   = vdda;

        osDelay(1u);
    }
}

/* ==========================================================================
 * ControlTask
 *   - PWMIN(TIM3_CH0A) 走 RC 形成等效 DAC
 *   - 前馈 + 慢积分：
 *       duty_ff = (Vpwm_target - DCDC_PWM_OFFSET_V) / ... 见下
 *       integ  += Ki * err * dt
 *       duty    = duty_ff + integ
 * ========================================================================== */
void StartControlTask(void *argument)
{
    (void)argument;

    /* 注意：PWM 已在 MX_TIM3_Init() 里 Tim3_M23_Run() 启动，
     * 对应原工程 HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1) 的位置。 */

    for (;;) {
        float vset, vset2, vout, vdda;
        float duty_ff, duty_ff2, err, err2, duty, duty2;

        /* 读取共享测量/设定 */
        if (osMutexAcquire(ADJSetMutexHandle, 5u) == osOK) {
            vset  = s_vset_v;
            vset2 = s_vset2_v;
            vout  = s_vout_v;
            vdda  = s_vdda_v;
            (void)osMutexRelease(ADJSetMutexHandle);
        } else {
            vset  = s_vset_v;
            vset2 = s_vset2_v;
            vout  = s_vout_v;
            vdda  = s_vdda_v;
        }

        /* ---- 前馈 ----
         * 由 Vout = gain * (offset - Vpwm)  解出
         *      Vpwm_target = offset - Vout/gain
         * 再折算成占空比（PWM 高电平 = VDDA）：
         *      duty_ff = (offset - Vset/gain) / VDDA
         *
         * 注意方向：本板占空比 ↑ -> Vpwm ↑ -> 输出 ↓，
         * 所以积分项也要同号，见下面 err 的用法。            */
        if (vdda > 0.1f) {
            duty_ff  = (DCDC_PWM_OFFSET_V - (vset  / DCDC_PWM_GAIN_V_PER_V)) / vdda;
            duty_ff2 = (DCDC_PWM_OFFSET_V - (vset2 / DCDC_PWM_GAIN_V_PER_V)) / vdda;
        } else {
            duty_ff  = 0.0f;
            duty_ff2 = 0.0f;
        }
        duty_ff  = clampf(duty_ff,  DUTY_MIN, DUTY_MAX);
        duty_ff2 = clampf(duty_ff2, DUTY_MIN, DUTY_MAX);

        /* ---- 误差（V）----
         * 反向通道：输出偏低 -> 需要降低占空比 -> 误差取反号积分。
         *
         * 注意：本板 OFB 没有引出到 MCU（见 README 的硬件对照），
         * 所以 vout 实际恒为 0，err = -vset，积分器会一路推到
         * -INTEG_LIMIT。这正是"开环标定 + 慢积分"退化成纯前馈的表现，
         * 属于当前硬件的预期行为；等 OFB 引出来后这段闭环才会生效。 */
        err  = vout - vset;
        err2 = 0.0f - vset2;      /* ADJ2 无回读，按开环处理 */

        s_integ  += (CTRL_KI * err  * CTRL_DT_S);
        s_integ2 += (CTRL_KI * err2 * CTRL_DT_S);
        s_integ  = clampf(s_integ,  -INTEG_LIMIT, INTEG_LIMIT);
        s_integ2 = clampf(s_integ2, -INTEG_LIMIT, INTEG_LIMIT);

        /* ---- 合成 duty ---- */
        duty  = clampf(duty_ff  + s_integ,  DUTY_MIN, DUTY_MAX);
        duty2 = clampf(duty_ff2 + s_integ2, DUTY_MIN, DUTY_MAX);

        /* ---- 写 PWM ---- */
        TIM_SetPWMIN(duty);
        TIM_SetPWMIN2(duty2);

        /* ---- 写共享给 UI/调试 ---- */
        if (osMutexAcquire(ADJSetMutexHandle, 2u) == osOK) {
            s_duty_cmd  = duty;
            s_duty2_cmd = duty2;
            (void)osMutexRelease(ADJSetMutexHandle);
        } else {
            s_duty_cmd  = duty;
            s_duty2_cmd = duty2;
        }

        /* 保留原工程的 shared_data 出口 */
        g_pwm_cmd.pwm1 = (uint16_t)(duty  * (float)(PWM_ARR + 1u));
        g_pwm_cmd.pwm2 = (uint16_t)(duty2 * (float)(PWM_ARR + 1u));

        osDelay(CTRL_PERIOD_MS);
    }
}

/* ==========================================================================
 * ButtonTask
 *   - UP/DOWN 调 Vset，短按 0.10V / 长按连发 0.50V
 *   - LEFT/RIGHT/MID 保留结构供扩展
 * ========================================================================== */
void StartButtonTask(void *argument)
{
    #define NUM_KEYS         BOARD_KEY_COUNT
    #define DEBOUNCE_TICKS   20u
    #define REPEAT_PERIOD    80u
    #define REPEAT_START     400u

    typedef struct {
        bool     pressed;
        uint32_t press_tick;
        uint32_t last_evt_tick;
        uint32_t last_repeat_tick;
    } KeyState_t;

    static KeyState_t keys[NUM_KEYS];

    BtnEvent_t evt;
    osStatus_t status;
    uint32_t   now;
    uint8_t    i;

    const float step_short_v = 0.10f;
    const float step_long_v  = 0.50f;

    (void)argument;

    for (;;) {
        bool any_pressed = false;

        for (i = 0u; i < NUM_KEYS; i++) {
            if (keys[i].pressed) { any_pressed = true; break; }
        }

        status = osMessageQueueGet(buttonQueueHandle, &evt, 0,
                                   any_pressed ? REPEAT_PERIOD : osWaitForever);
        now = xTaskGetTickCount();

        /* 处理来自 ISR 的按键事件（消抖 + 立即动作） */
        if (status == osOK) {
            if (evt.key_id < NUM_KEYS) {
                KeyState_t *k = &keys[evt.key_id];

                if ((evt.tick - k->last_evt_tick) >= DEBOUNCE_TICKS) {
                    k->last_evt_tick = evt.tick;

                    if (evt.type == BTN_EVENT_PRESS) {
                        if (!k->pressed) {
                            k->pressed = true;
                            k->press_tick = evt.tick;
                            k->last_repeat_tick = evt.tick;

                            /* 立即动作：UP/DOWN 调 Vset */
                            if (evt.key_id == 0u || evt.key_id == 1u) {
                                if (osMutexAcquire(ADJSetMutexHandle, 10u) == osOK) {
                                    if (evt.key_id == 0u) s_vset_v += step_short_v;
                                    else                  s_vset_v -= step_short_v;
                                    s_vset_v = clampf(s_vset_v, VSET_MIN_V, VSET_MAX_V);
                                    (void)osMutexRelease(ADJSetMutexHandle);
                                }
                            }
                        }
                    } else { /* RELEASE */
                        if (k->pressed) {
                            k->pressed = false;
                            k->last_repeat_tick = 0u;
                        }
                    }
                }
            }
        }

        /* 按住连发 */
        for (i = 0u; i < NUM_KEYS; i++) {
            KeyState_t *k = &keys[i];
            uint32_t held;

            if (!k->pressed) continue;

            held = now - k->press_tick;

            if ((i == 0u || i == 1u) && (held >= REPEAT_START)) {
                if ((now - k->last_repeat_tick) >= REPEAT_PERIOD) {
                    if (osMutexAcquire(ADJSetMutexHandle, 10u) == osOK) {
                        if (i == 0u) s_vset_v += step_long_v;
                        else         s_vset_v -= step_long_v;
                        s_vset_v = clampf(s_vset_v, VSET_MIN_V, VSET_MAX_V);
                        (void)osMutexRelease(ADJSetMutexHandle);
                    }
                    k->last_repeat_tick = now;
                }
            }
        }
    }
}

/* ==========================================================================
 * DisplayTask
 *   u8g2 UI：设定电压大字 + OUT/VDDA/DUTY 小字
 *   另外翻转 LED1 做"活着"心跳 —— 原工程留了 4 个 LED 却没用上
 * ========================================================================== */
void StartDisplayTask(void *argument)
{
    extern uint8_t u8x8_byte_f072_hw_i2c(u8x8_t *u8x8, uint8_t msg,
                                         uint8_t arg_int, void *arg_ptr);
    extern uint8_t u8x8_gpio_and_delay_f072(u8x8_t *u8x8, uint8_t msg,
                                            uint8_t arg_int, void *arg_ptr);

    u8g2_t u8g2;

    (void)argument;

    u8g2_Setup_sh1106_i2c_128x64_noname_f(&u8g2, U8G2_R0,
                                          u8x8_byte_f072_hw_i2c,
                                          u8x8_gpio_and_delay_f072);
    u8g2_InitDisplay(&u8g2);
    u8g2_SetPowerSave(&u8g2, 0);

    for (;;) {
        float vset, vout, vdda, duty;

        if (osMutexAcquire(ADJSetMutexHandle, 5u) == osOK) {
            vset = s_vset_v;
            vout = s_vout_v;
            vdda = s_vdda_v;
            duty = s_duty_cmd;
            (void)osMutexRelease(ADJSetMutexHandle);
        } else {
            vset = s_vset_v;
            vout = s_vout_v;
            vdda = s_vdda_v;
            duty = s_duty_cmd;
        }

        u8g2_ClearBuffer(&u8g2);

        /* ===== 中间大字：设定电压 ===== */
        {
            int32_t  x = (int32_t)(vset * 100.0f + (vset >= 0 ? 0.5f : -0.5f));
            uint32_t ip, fp;
            char     big[16];
            char    *p = big;
            int      w, x0;

            if (x < 0) x = 0;
            ip = (uint32_t)(x / 100);
            fp = (uint32_t)(x % 100);

            if (ip >= 100u) {
                *p++ = (char)('0' + (ip / 100u));
                *p++ = (char)('0' + ((ip / 10u) % 10u));
                *p++ = (char)('0' + (ip % 10u));
            } else if (ip >= 10u) {
                *p++ = (char)('0' + (ip / 10u));
                *p++ = (char)('0' + (ip % 10u));
            } else {
                *p++ = (char)('0' + ip);
            }
            *p++ = '.';
            *p++ = (char)('0' + (fp / 10u));
            *p++ = (char)('0' + (fp % 10u));
            *p++ = 'V';
            *p++ = '\0';

            u8g2_SetFont(&u8g2, u8g2_font_logisoso24_tf);
            w = u8g2_GetStrWidth(&u8g2, big);
            x0 = (128 - w) / 2;
            if (x0 < 0) x0 = 0;
            u8g2_DrawStr(&u8g2, x0, 44, big);
        }

        /* ===== 小字信息 ===== */
        u8g2_SetFont(&u8g2, u8g2_font_6x10_tr);

        /* 左上：OUT:xx.xxV */
        {
            int32_t  x = (int32_t)(vout * 100.0f + (vout >= 0 ? 0.5f : -0.5f));
            uint32_t ip, fp;
            char     s[16];
            char    *p = s;

            if (x < 0) x = 0;
            ip = (uint32_t)(x / 100);
            fp = (uint32_t)(x % 100);

            *p++ = 'O'; *p++ = 'U'; *p++ = 'T'; *p++ = ':';
            if (ip >= 100u) {
                *p++ = (char)('0' + (ip / 100u));
                *p++ = (char)('0' + ((ip / 10u) % 10u));
                *p++ = (char)('0' + (ip % 10u));
            } else if (ip >= 10u) {
                *p++ = (char)('0' + (ip / 10u));
                *p++ = (char)('0' + (ip % 10u));
            } else {
                *p++ = (char)('0' + ip);
            }
            *p++ = '.';
            *p++ = (char)('0' + (fp / 10u));
            *p++ = (char)('0' + (fp % 10u));
            *p++ = 'V';
            *p++ = '\0';

            u8g2_DrawStr(&u8g2, 0, 12, s);
        }

        /* 右上：VDD:x.xxx */
        {
            int32_t  mv = (int32_t)(vdda * 1000.0f + (vdda >= 0 ? 0.5f : -0.5f));
            uint32_t ip, fp;
            char     s[16];
            char    *p = s;
            int      w, x0;

            if (mv < 0) mv = 0;
            ip = (uint32_t)(mv / 1000);
            fp = (uint32_t)(mv % 1000);

            *p++ = 'V'; *p++ = 'D'; *p++ = 'D'; *p++ = ':';
            *p++ = (char)('0' + (ip % 10u));
            *p++ = '.';
            p[0] = (char)('0' + (fp / 100u));
            p[1] = (char)('0' + ((fp / 10u) % 10u));
            p[2] = (char)('0' + (fp % 10u));
            p += 3;
            *p++ = '\0';

            w = u8g2_GetStrWidth(&u8g2, s);
            x0 = 128 - w;
            if (x0 < 0) x0 = 0;
            u8g2_DrawStr(&u8g2, x0, 12, s);
        }

        /* 右下：D:xxx% */
        {
            int32_t pct = (int32_t)(duty * 100.0f + 0.5f);
            char    s[16];
            char   *p = s;
            int     w, x0;

            if (pct < 0) pct = 0;
            if (pct > 100) pct = 100;

            *p++ = 'D'; *p++ = ':';
            if (pct < 10) {
                *p++ = ' '; *p++ = ' ';
                *p++ = (char)('0' + pct);
            } else if (pct < 100) {
                *p++ = ' ';
                *p++ = (char)('0' + (pct / 10));
                *p++ = (char)('0' + (pct % 10));
            } else {
                *p++ = '1'; *p++ = '0'; *p++ = '0';
            }
            *p++ = '%';
            *p++ = '\0';

            w = u8g2_GetStrWidth(&u8g2, s);
            x0 = 128 - w;
            if (x0 < 0) x0 = 0;
            u8g2_DrawStr(&u8g2, x0, 63, s);
        }

        u8g2_SendBuffer(&u8g2);

        /* LED1 心跳：一帧翻一次，能直观看出刷屏任务还活着 */
        LED1_TURN();

        /* 不加 osDelay：靠最低优先级自然限帧（与原工程一致）*/
    }
}

/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */
/* USER CODE END Application */
