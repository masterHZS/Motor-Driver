#include "app_input.h"
#include "os_api.h"
#include "gpio.h"
#include "app_shared_data.h"
#include "board.h"
#include "stdbool.h"

#define NUM_KEYS        BOARD_KEY_COUNT
#define DEBOUNCE_TICKS  20
#define REPEAT_PERIOD   10
#define REPEAT_START    500

typedef struct {
    bool     pressed;
    uint32_t press_tick;
    uint32_t last_evt_tick;
    uint32_t last_repeat_tick;
} KeyState_t;

static KeyState_t keys[NUM_KEYS] = {0};

/* 原工程用 GPIO_TypeDef* + pin 读电平；F072 用 port + pin 走
 * Gpio_GetInputData()。表要与 gpio.c / board.h 的顺序一致。 */
static const en_gpio_port_t s_key_port[NUM_KEYS] = {
    BOARD_KEY0_PORT, BOARD_KEY1_PORT, BOARD_KEY2_PORT,
    BOARD_KEY3_PORT, BOARD_KEY4_PORT
};
static const en_gpio_pin_t s_key_pin[NUM_KEYS] = {
    BOARD_KEY0_PIN, BOARD_KEY1_PIN, BOARD_KEY2_PIN,
    BOARD_KEY3_PIN, BOARD_KEY4_PIN
};

void Input_Init(void)
{
    /* GPIO 侧已在 MX_GPIO_Init() 里配好上拉与中断 */
}

void Input_HandleEvent(BtnEvent_t *evt)
{
    if (evt->key_id >= NUM_KEYS) return;
    KeyState_t *k = &keys[evt->key_id];
    if ((evt->tick - k->last_evt_tick) < DEBOUNCE_TICKS) return;

    k->last_evt_tick = evt->tick;
    if (evt->type == BTN_EVENT_PRESS && !k->pressed) {
        k->pressed = true;
        k->press_tick = evt->tick;
        k->last_repeat_tick = evt->tick;

        /* LEFT/RIGHT 翻页 */
        if (evt->key_id == 2 || evt->key_id == 3) {
            uint8_t old_page = g_display_page;
            g_display_page = (uint8_t)((g_display_page +
                              (evt->key_id == 3 ? 1u : (DISPLAY_NUM_PAGES - 1u)))
                              % DISPLAY_NUM_PAGES);
            if (old_page != g_display_page && sysEventFlagsHandle != 0)
                (void)osEventFlagsSet(sysEventFlagsHandle, EVT_PAGE_CHANGED);
        }
        /* UP/DOWN 调整当前页设置 */
        else if (evt->key_id == 0 || evt->key_id == 1) {
            if (osMutexAcquire(ADJSetMutexHandle, 0) == osOK) {
                float step = 0.1f;
                if (g_display_page == 0) {
                    g_adj_target.adj1_set_v += (evt->key_id == 0 ? step : -step);
                    if (g_adj_target.adj1_set_v > 24.0f) g_adj_target.adj1_set_v = 24.0f;
                    if (g_adj_target.adj1_set_v < 0.0f) g_adj_target.adj1_set_v = 0.0f;
                } else if (g_display_page == 1) {
                    g_adj_target.adj2_set_v += (evt->key_id == 0 ? step : -step);
                    if (g_adj_target.adj2_set_v > 24.0f) g_adj_target.adj2_set_v = 24.0f;
                    if (g_adj_target.adj2_set_v < 0.0f) g_adj_target.adj2_set_v = 0.0f;
                }
                (void)osMutexRelease(ADJSetMutexHandle);
                if (sysEventFlagsHandle != 0)
                    (void)osEventFlagsSet(sysEventFlagsHandle, EVT_ADJ_TARGET_UPDATED);
            }
        }
    } else if (evt->type == BTN_EVENT_RELEASE) {
        k->pressed = false;
        k->last_repeat_tick = 0;
    }
}

/** 读按键物理状态：低 = 按下（与 gpio.c 的中断扫描逻辑保持一致）*/
static bool key_is_down(uint8_t idx)
{
    uint16_t data = Gpio_GetInputData(s_key_port[idx]);
    return (((data & (1u << s_key_pin[idx])) == 0u) ? true : false);
}

void Input_PeriodicTask(void)
{
    uint32_t now = osKernelGetTickCount();
    uint8_t  i;

    for (i = 0; i < NUM_KEYS; i++) {
        KeyState_t *k = &keys[i];
        if (!k->pressed) continue;
        if (!key_is_down(i)) { k->pressed = false; continue; }
        if ((now - k->press_tick >= REPEAT_START) &&
            (now - k->last_repeat_tick >= REPEAT_PERIOD)) {
            /* 重复处理逻辑和短按一样 */
            BtnEvent_t evt;
            evt.key_id   = i;
            evt.type     = (uint8_t)BTN_EVENT_PRESS;
            evt.reserved = 0u;
            evt.tick     = now;
            Input_HandleEvent(&evt);
            k->last_repeat_tick = now;
        }
    }
}
