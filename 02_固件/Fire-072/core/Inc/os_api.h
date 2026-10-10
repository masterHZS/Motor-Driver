/**
  ******************************************************************************
  * @file    os_api.h
  * @brief   Fire-072 轻量内核 API —— 兼容原工程的 FreeRTOS / CMSIS-RTOS2 调用
  *
  * 【为什么不用真 FreeRTOS】
  *   HC32F072JATA 只有 16KB RAM。原 F103 工程的 CubeMX 配置是
  *   configTOTAL_HEAP_SIZE = 12288 字节，光 FreeRTOS 堆就吃掉 12KB；
  *   再叠加 ADCTask(4KB) / ControlTask(2KB) / ButtonTask(2KB) /
  *   DisplayTask(2KB) 的栈（1 word = 4 byte，所以 1024*4 = 4KB 栈），
  *   在 16KB 上必然溢出。
  *
  *   而本工程实际只有：1 路 100Hz 控制环、1 路 ADC 扫描、按键扫描、
  *   低优先级刷屏 —— 没有并发需求，也不需要抢占式调度。
  *
  *   所以这里用 ~40 行汇编 + 一个 tick 中断实现"任务 + 延时 + 互斥 +
  *   信号量 + 消息队列"的最小集合，API 名字与语义对齐 CMSIS-RTOS2，
  *   使 freertos.c 里的业务代码可以逐行保留。
  *
  * 【栈容量的差别】
  *   CMSIS-RTOS2 的 osThreadAttr_t.stack_size 单位是【字节】，而 CubeMX
  *   生成代码里写的 `1024 * 4` 是当年的笔误（本意 1024 word = 4KB）。
  *   本内核里 stack_size 就是字节数，任务表里已按实际需要重新取值，
  *   详见 os_api.c 顶部的任务栈预算表。
  ******************************************************************************
  */

#ifndef FIRE072_OS_API_H
#define FIRE072_OS_API_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void *osThreadId_t;
typedef void *osMutexId_t;
typedef void *osSemaphoreId_t;
typedef void *osMessageQueueId_t;
typedef void *osEventFlagsId_t;

typedef int32_t osStatus_t;

#define osOK                ((osStatus_t)0)
#define osError             ((osStatus_t)-1)
#define osErrorTimeout      ((osStatus_t)-2)
#define osErrorResource     ((osStatus_t)-3)
#define osErrorParameter    ((osStatus_t)-4)

#define osWaitForever       ((uint32_t)0xFFFFFFFFu)

typedef enum {
    osPriorityNone       = 0,
    osPriorityIdle       = 1,
    osPriorityLow        = 8,
    osPriorityBelowNormal = 16,
    osPriorityNormal     = 24,
    osPriorityAboveNormal = 32,
    osPriorityHigh       = 40,
    osPriorityRealtime   = 48
} osPriority_t;

typedef struct {
    const char   *name;
    uint32_t      attr_bits;
    void         *cb_mem;
    uint32_t      cb_size;
    void         *stack_mem;
    uint32_t      stack_size;   /* 单位：字节 */
    osPriority_t  priority;
    uint32_t      tz_module;
    uint32_t      reserved;
} osThreadAttr_t;

typedef struct {
    const char *name;
    uint32_t    attr_bits;
    void       *cb_mem;
    uint32_t    cb_size;
} osMutexAttr_t;

typedef struct {
    const char *name;
    uint32_t    attr_bits;
    void       *cb_mem;
    uint32_t    cb_size;
} osSemaphoreAttr_t;

typedef struct {
    const char *name;
    uint32_t    attr_bits;
    void       *cb_mem;
    uint32_t    cb_size;
} osMessageQueueAttr_t;
typedef osMessageQueueAttr_t osEventFlagsAttr_t;

/* 内核最大任务数 */
#define OS_MAX_THREADS      6u
/* 优先级档位数 */
#define OS_PRIO_LEVELS      8u
/* 每个任务的阻塞原因数量上限（互斥/信号量/队列） */
#define OS_MAX_OBJECTS      8u

/* ---------------- 内核 ---------------- */
void        osKernelInitialize(void);
void        osKernelStart(void);            /* 不返回 */
uint32_t    osKernelGetTickCount(void);
uint32_t    xTaskGetTickCount(void);        /* FreeRTOS 兼容别名 */
void        osDelay(uint32_t ticks);
void        osKernelTick(void);             /* 由 SysTick 每 1ms 调用 */

/* ---------------- 任务 ---------------- */
osThreadId_t osThreadNew(void (*func)(void *), void *argument,
                         const osThreadAttr_t *attr);

/* ---------------- 互斥锁 ---------------- */
osMutexId_t  osMutexNew(const osMutexAttr_t *attr);
osStatus_t   osMutexAcquire(osMutexId_t mutex_id, uint32_t timeout);
osStatus_t   osMutexRelease(osMutexId_t mutex_id);

/* ---------------- 信号量 ---------------- */
osSemaphoreId_t osSemaphoreNew(uint32_t max_count, uint32_t initial_count,
                               const osSemaphoreAttr_t *attr);
osStatus_t      osSemaphoreAcquire(osSemaphoreId_t semaphore_id, uint32_t timeout);
osStatus_t      osSemaphoreRelease(osSemaphoreId_t semaphore_id);

/* ---------------- 消息队列 ---------------- */
osMessageQueueId_t osMessageQueueNew(uint32_t msg_count, uint32_t msg_size,
                                     const osMessageQueueAttr_t *attr);
osStatus_t         osMessageQueueGet(osMessageQueueId_t mq_id, void *msg_ptr,
                                     uint8_t *msg_prio, uint32_t timeout);
osStatus_t         osMessageQueuePut(osMessageQueueId_t mq_id, const void *msg_ptr,
                                     uint8_t msg_prio, uint32_t timeout);

/* ---------------- 事件标志 ---------------- */
osEventFlagsId_t osEventFlagsNew(const osEventFlagsAttr_t *attr);
uint32_t         osEventFlagsSet(osEventFlagsId_t ef_id, uint32_t flags);
uint32_t         osEventFlagsClear(osEventFlagsId_t ef_id, uint32_t flags);
uint32_t         osEventFlagsGet(osEventFlagsId_t ef_id);
uint32_t         osEventFlagsWait(osEventFlagsId_t ef_id, uint32_t flags,
                                  uint32_t options, uint32_t timeout);

/* ---------------- 中断上下文安全的队列投递 ---------------- */
osStatus_t osMessageQueuePutISR(osMessageQueueId_t mq_id, const void *msg_ptr);

#ifdef __cplusplus
}
#endif

#endif /* FIRE072_OS_API_H */
