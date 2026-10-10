/**
  ******************************************************************************
  * @file    os_api.c
  * @brief   Fire-072 轻量内核实现（Cortex-M0+，PendSV 上下文切换）
  *
  * 【任务栈预算表】总共 16KB RAM，全部用静态数组，不设堆。
  *   ADCTask     512 B    EMA 浮点 + 读取 DMA 缓冲，无递归
  *   ControlTask 256 B    纯浮点运算
  *   ButtonTask  256 B    消抖状态机
  *   DisplayTask 640 B    u8g2 栈帧
  *   DefaultTask 128 B
  *   空闲任务     128 B
  *   合计       1920 B
  *   再加 u8g2 显存 ~1KB、I2C 帧缓冲 132B、ADC DMA 缓冲 14B、
  *   按键队列 64B，静态占用约 3.3KB，16KB 里余量充足。
  *
  * 【调度模型】
  *   优先级 0..7（大者优先），抢占点 = SysTick(1ms) 与显式阻塞。
  *   对象（互斥/信号量/队列/事件）阻塞时把任务置 T_BLOCKED 并挂到对象
  *   的等待者上；Release/Put 时唤醒等待者。所有对象操作在关中断的
  *   临界区内完成，故本身是原子的。
  ******************************************************************************
  */

#include "os_api.h"
#include "ddl.h"
#include <string.h>

/* ==========================================================================
 * 任务状态
 * ========================================================================== */
typedef enum {
    T_UNUSED = 0,
    T_READY,
    T_SLEEP,        /* 延时，等到 wake_tick */
    T_BLOCKED,      /* 等待对象 */
    T_BOOT          /* 占位：启动瞬间的"上一个上下文" */
} task_state_t;

typedef struct os_tcb {
    uint32_t        *sp;        /* 必须第一个成员：汇编按偏移 0 访问 */
    void           (*entry)(void *);
    void            *arg;
    uint8_t          prio;      /* 0..7，7 最高 */
    volatile uint8_t state;
    volatile uint8_t wait_prim; /* 允许的唤醒原因位图 */
    volatile uint8_t wait_hit;  /* 实际命中的原因 */
    uint32_t         wake_tick;
    void            *wait_obj;
    uint8_t          pad[8];    /* 补齐到 32 字节，见下面 OS_TCB_STRIDE */
} os_tcb_t;

/* 9 个成员 ×4 字节 = 24，pad 补 8 -> 32 字节。
 * 取 32（而不是 28）是为了让 PendSV 的下标运算只用一条 lsls 就够了 ——
 * ARMv6-M 是 Thumb-1，SUBS 不支持带移位的第二操作数（`subs r1,r1,r1,lsl#2`
 * 汇编会直接报错），所以步长取 2 的幂最省事也最不容易出错。
 * 步长在汇编里是写死的，下面这个断言保证结构体真的那么大：
 * 往结构体里加字段时编译会立刻报错，不会静默取错地址。 */
#define OS_TCB_STRIDE  32u
typedef char os_tcb_stride_check[
    (sizeof(os_tcb_t) == OS_TCB_STRIDE) ? 1 : -1
];

/* 唤醒原因 */
#define WK_TIMEOUT  (1u << 0)
#define WK_OBJECT   (1u << 1)

static os_tcb_t         s_tcb[OS_MAX_THREADS];
static volatile uint8_t s_num_tasks;
static volatile uint8_t s_curr;
static volatile uint32_t s_tick;

/* 汇编里假设 sp 是 os_tcb_t 的第 0 个成员（偏移 0），且步长固定 32 字节 */
typedef char os_tcb_sp_offset_check[
    (__builtin_offsetof(os_tcb_t, sp) == 0u) ? 1 : -1
];

/* 汇编里引用 */
volatile uint32_t s_next;

static uint32_t s_idle_stack[128 / 4];

/* ==========================================================================
 * 临界区
 * ========================================================================== */
static inline uint32_t os_enter_critical(void)
{
    uint32_t primask = __get_PRIMASK();
    __disable_irq();
    return primask;
}

static inline void os_exit_critical(uint32_t primask)
{
    if (primask == 0u) {
        __enable_irq();
    }
}

/* ==========================================================================
 * 上下文切换汇编
 *   rtos_pendsv_handler : 保存 r4-r11 -> s_tcb[s_curr].sp，
 *                         切到 s_next，恢复 r4-r11 后异常返回。
 * --------------------------------------------------------------------------
 * 硬件自动压栈顺序（地址由低到高）：r0 r1 r2 r3 r12 lr pc xPSR  (32 字节)
 * 软件保存区放在其下方（更低地址）8 个字：r4 r5 r6 r7 r8 r9 r10 r11
 *
 * TCB 步长不写死：由编译期常量 OS_TCB_STRIDE 展开成移位/加法，
 * 这样往 os_tcb_t 里加字段也不会让汇编取到错的地址。
 * ========================================================================== */
extern void rtos_pendsv_handler(void);

/* 下标 × 32（= sizeof(os_tcb_t)，见上面的断言）。
 * 步长故意取 2 的幂：ARMv6-M 的 SUBS 不支持带移位的第二操作数，
 * 一条 lsls 就够，既省指令也不会踩 Thumb-1 的编码限制。 */
#define OS_STRIDE_ASM  "    lsls r1, r1, #5\n"

__asm__(
    ".syntax unified\n"
    ".cpu    cortex-m0plus\n"
    ".fpu    softvfp\n"
    ".arch   armv6-m\n"
    ".text\n"
    ".thumb\n"
    ".align 2\n"

    ".global rtos_pendsv_handler\n"
    ".type   rtos_pendsv_handler, %function\n"
    "rtos_pendsv_handler:\n"
    "    ldr  r3, .Lcurr_addr\n"       /* r3 = &s_curr                    */
    "    ldrb r1, [r3]\n"              /* r1 = s_curr                     */
    OS_STRIDE_ASM                      /* r1 = s_curr * sizeof(os_tcb_t)  */
    "    ldr  r2, .Ltcb_addr\n"        /* r2 = s_tcb                      */
    "    adds r2, r2, r1\n"            /* r2 = &s_tcb[s_curr]             */
    "    mrs  r0, psp\n"               /* r0 = 硬件压栈后的 sp            */
    "    subs r0, r0, #32\n"           /* 预留 r4-r11 区（栈向下生长）    */
    "    stmia r0!, {r4-r7}\n"         /* 存 r4-r7                        */
    "    mov  r4, r8\n"
    "    mov  r5, r9\n"
    "    mov  r6, r10\n"
    "    mov  r7, r11\n"
    "    stmia r0!, {r4-r7}\n"         /* 存 r8-r11                       */
    "    subs r0, r0, #32\n"
    "    str  r0, [r2]\n"              /* s_tcb[s_curr].sp = r0           */

    "    ldr  r3, .Lnext_addr\n"       /* r3 = &s_next                    */
    "    ldr  r1, [r3]\n"              /* r1 = s_next                     */
    "    ldr  r3, .Lcurr_addr2\n"
    "    strb r1, [r3]\n"              /* s_curr = s_next                 */

    OS_STRIDE_ASM                      /* r1 = s_next * sizeof(os_tcb_t)  */
    "    ldr  r2, .Ltcb_addr2\n"
    "    adds r2, r2, r1\n"
    "    ldr  r0, [r2]\n"              /* r0 = s_tcb[s_next].sp           */
    "    adds r0, r0, #16\n"
    "    ldmia r0!, {r4-r7}\n"         /* 取 r8-r11                       */
    "    mov  r8, r4\n"
    "    mov  r9, r5\n"
    "    mov  r10, r6\n"
    "    mov  r11, r7\n"
    "    subs r0, r0, #32\n"
    "    ldmia r0!, {r4-r7}\n"         /* 取 r4-r7                        */
    "    adds r0, r0, #16\n"           /* 跳过 r8-r11 保存区              */
    "    msr  psp, r0\n"
    "    bx   lr\n"

    ".align 2\n"
    ".Lcurr_addr:  .word s_curr\n"
    ".Lcurr_addr2: .word s_curr\n"
    ".Ltcb_addr:   .word s_tcb\n"
    ".Ltcb_addr2:  .word s_tcb\n"
    ".Lnext_addr:  .word s_next\n"
);

/* ==========================================================================
 * 调度
 * ========================================================================== */

/** 选出优先级最高的 READY 任务，同优先级从 s_curr 之后轮转 */
static void os_pick_next(void)
{
    uint8_t i;
    uint8_t best = 0u;
    uint8_t best_prio = 0u;
    uint8_t found = 0u;

    for (i = 0u; i < s_num_tasks; i++) {
        uint8_t idx = (uint8_t)((s_curr + 1u + i) % s_num_tasks);
        uint8_t pr;

        if (s_tcb[idx].state != T_READY) {
            continue;
        }
        pr = s_tcb[idx].prio;
        if ((found == 0u) || (pr > best_prio)) {
            best_prio = pr;
            best = idx;
            found = 1u;
            if (pr == (OS_PRIO_LEVELS - 1u)) {
                break;              /* 已是最优 */
            }
        }
    }

    s_next = (found != 0u) ? best : 0u;

    if (s_next != (uint32_t)s_curr) {
        /* 置 PendSV 挂起位，异常返回时完成切换 */
        *((volatile uint32_t *)0xE000ED04u) = (1u << 28);
    }
}

/** 把当前任务挂到对象上阻塞等待 */
static osStatus_t os_block_on(void *obj, uint32_t timeout, uint8_t prim_allow)
{
    uint32_t primask = os_enter_critical();
    osStatus_t st = osOK;

    s_tcb[s_curr].wait_obj  = obj;
    s_tcb[s_curr].wait_prim = prim_allow;
    s_tcb[s_curr].wait_hit  = 0u;
    s_tcb[s_curr].wake_tick = (timeout == osWaitForever)
                              ? 0u : (s_tick + timeout);
    s_tcb[s_curr].state     = T_BLOCKED;

    os_pick_next();
    os_exit_critical(primask);

    /* 被唤醒后回到这里（可能立刻被切回，也可能等很久） */
    primask = os_enter_critical();
    if (s_tcb[s_curr].wait_hit == 0u) {
        /* 既没超时也没拿到对象 —— 不应该发生，防御性返回错误 */
        st = osError;
    } else if ((s_tcb[s_curr].wait_hit & WK_OBJECT) != 0u) {
        st = osOK;
    } else {
        st = osErrorTimeout;
    }
    s_tcb[s_curr].wait_obj = 0;
    os_exit_critical(primask);

    return st;
}

/** 唤醒所有挂在 obj 上的等待者（由 Release/Put 调用，内部已关中断） */
static void os_wake_waiters(void *obj)
{
    uint8_t i;

    for (i = 0u; i < s_num_tasks; i++) {
        if ((s_tcb[i].state == T_BLOCKED) &&
            (s_tcb[i].wait_obj == obj) &&
            ((s_tcb[i].wait_prim & WK_OBJECT) != 0u)) {
            s_tcb[i].wait_hit |= WK_OBJECT;
            s_tcb[i].state = T_READY;
        }
    }
}

/******************************************************************************
 * 初始化 / 启动
 ******************************************************************************/
void osKernelInitialize(void)
{
    uint8_t i;

    for (i = 0u; i < OS_MAX_THREADS; i++) {
        s_tcb[i].sp = 0;
        s_tcb[i].entry = 0;
        s_tcb[i].arg = 0;
        s_tcb[i].prio = 0u;
        s_tcb[i].state = T_UNUSED;
        s_tcb[i].wait_obj = 0;
        s_tcb[i].wake_tick = 0u;
    }
    s_num_tasks = 0u;
    s_curr = 0u;
    s_next = 0u;
    s_tick = 0u;
}

uint32_t osKernelGetTickCount(void)
{
    return s_tick;
}

uint32_t xTaskGetTickCount(void)
{
    return s_tick;
}

static uint32_t *os_build_frame(uint32_t *stack_top, void (*entry)(void *),
                                void *arg)
{
    uint32_t *sp = stack_top;

    sp -= 8;                            /* r4-r11 软件保存区 */
    memset(sp, 0, 8u * sizeof(uint32_t));
    sp -= 8;                            /* 硬件栈帧 */

    sp[0] = 0x01000000u;                /* xPSR：T 位 */
    sp[1] = ((uint32_t)entry) | 1u;     /* pc */
    sp[2] = 0xFFFFFFF9u;                /* lr：异常返回后进 thread 模式用 PSP */
    sp[3] = 0u;                         /* r12 */
    sp[4] = (uint32_t)arg;              /* r0 */
    sp[5] = 0u;
    sp[6] = 0u;
    sp[7] = 0u;

    return sp;
}

osThreadId_t osThreadNew(void (*func)(void *), void *argument,
                         const osThreadAttr_t *attr)
{
    uint32_t  primask;
    uint8_t   idx;
    uint32_t *stack_mem;
    uint32_t  stack_words;
    uint32_t  top;
    os_tcb_t *t;

    if ((func == 0) || (attr == 0) || (attr->stack_mem == 0)) {
        return 0;
    }

    primask = os_enter_critical();
    if (s_num_tasks >= OS_MAX_THREADS) {
        os_exit_critical(primask);
        return 0;
    }
    idx = s_num_tasks;

    stack_mem = (uint32_t *)attr->stack_mem;
    stack_words = attr->stack_size / 4u;
    if (stack_words < 64u) {
        stack_words = 64u;              /* 最小 256 字节 */
    }

    t = &s_tcb[idx];
    t->entry = func;
    t->arg   = argument;
    t->prio  = (uint8_t)((uint8_t)attr->priority / 8u);
    if (t->prio > (OS_PRIO_LEVELS - 1u)) {
        t->prio = OS_PRIO_LEVELS - 1u;
    }
    t->state     = T_READY;
    t->wait_obj  = 0;
    t->wait_prim = 0u;
    t->wait_hit  = 0u;
    t->wake_tick = 0u;

    top = ((uint32_t)stack_mem) + (stack_words * 4u);
    top &= ~7u;                         /* 8 字节对齐 */
    t->sp = os_build_frame((uint32_t *)top, func, argument);

    s_num_tasks = (uint8_t)(idx + 1u);
    os_exit_critical(primask);

    return (osThreadId_t)t;
}

static void os_idle_entry(void *arg)
{
    (void)arg;
    for (;;) {
        __asm__ volatile("wfi");
    }
}

void osKernelStart(void)
{
    static const osThreadAttr_t idle_attr = {
        "idle", 0u, 0, 0u, s_idle_stack, sizeof(s_idle_stack),
        osPriorityIdle, 0u, 0u
    };

    /* 空闲任务必须第一个建，占 TCB[0]，优先级最低 */
    (void)osThreadNew(os_idle_entry, 0, &idle_attr);

    s_curr = 0u;
    s_next = 0u;
    s_tick = 0u;
    s_tcb[0].state = T_BOOT;            /* 让 0 号任务先不可选 */

    os_pick_next();

    /*
     * 切到 PSP 并直接触发 PendSV。
     * 不用 SVC 是有意的：内联汇编块里没有 .arch 上下文时 GAS 按 ARMv4T 解析，
     * SVC 会被判为非法指令；直接挂 PendSV 等效且更省事 ——
     * 异常入口会把"启动上下文"压到当时的 PSP 上，PendSV 再把它存进
     * TCB[0]（此时 s_curr = 0），随后恢复 s_next 指向的任务。
     * osKernelStart() 永不返回，所以被压在 PSP 上的那几个字不会再被用到。
     */
    __asm__ volatile(
        "movs r0, #2\n"
        "msr  control, r0\n"
        "isb\n"
        :
        :
        : "r0", "memory"
    );

    /* 触发 PendSV，由它完成第一次任务切换 */
    *((volatile uint32_t *)0xE000ED04u) = (1u << 28);
    __asm__ volatile("dsb");

    for (;;) {
    }
}

/******************************************************************************
 * tick
 ******************************************************************************/
void osKernelTick(void)
{
    uint8_t i;
    uint8_t higher_ready = 0u;

    s_tick++;

    for (i = 0u; i < s_num_tasks; i++) {
        if ((s_tcb[i].state == T_BLOCKED) &&
            ((s_tcb[i].wait_prim & WK_TIMEOUT) != 0u) &&
            (s_tcb[i].wake_tick != 0u) &&
            ((int32_t)(s_tick - s_tcb[i].wake_tick) >= 0)) {
            s_tcb[i].wait_hit |= WK_TIMEOUT;
            s_tcb[i].state = T_READY;
        } else if ((s_tcb[i].state == T_SLEEP) &&
                   ((int32_t)(s_tick - s_tcb[i].wake_tick) >= 0)) {
            s_tcb[i].state = T_READY;
        }
    }

    /* 有比当前更高优先级任务就绪 -> 抢占 */
    for (i = 0u; i < s_num_tasks; i++) {
        if ((s_tcb[i].state == T_READY) &&
            (s_tcb[i].prio > s_tcb[s_curr].prio)) {
            higher_ready = 1u;
            break;
        }
    }
    if (higher_ready != 0u) {
        os_pick_next();
    }
}

void osDelay(uint32_t ticks)
{
    uint32_t primask;

    if (ticks == 0u) {
        primask = os_enter_critical();
        os_pick_next();
        os_exit_critical(primask);
        return;
    }

    primask = os_enter_critical();
    s_tcb[s_curr].wake_tick = s_tick + ticks;
    s_tcb[s_curr].state = T_SLEEP;
    os_pick_next();
    os_exit_critical(primask);
}

/******************************************************************************
 * 互斥锁
 ******************************************************************************/
struct os_mutex {
    volatile uint8_t locked;
};

static struct os_mutex s_mutexes[OS_MAX_OBJECTS];
static uint8_t s_mutex_used[OS_MAX_OBJECTS];

osMutexId_t osMutexNew(const osMutexAttr_t *attr)
{
    uint32_t primask = os_enter_critical();
    uint8_t i;

    (void)attr;
    for (i = 0u; i < OS_MAX_OBJECTS; i++) {
        if (s_mutex_used[i] == 0u) {
            s_mutex_used[i] = 1u;
            s_mutexes[i].locked = 0u;
            os_exit_critical(primask);
            return (osMutexId_t)&s_mutexes[i];
        }
    }
    os_exit_critical(primask);
    return 0;
}

osStatus_t osMutexAcquire(osMutexId_t mutex_id, uint32_t timeout)
{
    struct os_mutex *m = (struct os_mutex *)mutex_id;
    uint32_t primask;

    if (m == 0) {
        return osErrorParameter;
    }

    primask = os_enter_critical();
    if (m->locked == 0u) {
        m->locked = 1u;
        os_exit_critical(primask);
        return osOK;
    }
    os_exit_critical(primask);

    if (timeout == 0u) {
        return osErrorResource;
    }
    return os_block_on(m, timeout, WK_OBJECT | WK_TIMEOUT);
}

osStatus_t osMutexRelease(osMutexId_t mutex_id)
{
    struct os_mutex *m = (struct os_mutex *)mutex_id;
    uint32_t primask;

    if (m == 0) {
        return osErrorParameter;
    }
    primask = os_enter_critical();
    m->locked = 0u;
    os_wake_waiters(m);
    os_exit_critical(primask);
    return osOK;
}

/******************************************************************************
 * 信号量（计数型）
 ******************************************************************************/
struct os_sem {
    volatile uint32_t count;
    volatile uint32_t max;
};

static struct os_sem s_sems[OS_MAX_OBJECTS];
static uint8_t s_sem_used[OS_MAX_OBJECTS];

osSemaphoreId_t osSemaphoreNew(uint32_t max_count, uint32_t initial_count,
                               const osSemaphoreAttr_t *attr)
{
    uint32_t primask = os_enter_critical();
    uint8_t i;

    (void)attr;
    for (i = 0u; i < OS_MAX_OBJECTS; i++) {
        if (s_sem_used[i] == 0u) {
            s_sem_used[i] = 1u;
            s_sems[i].max = (max_count == 0u) ? 1u : max_count;
            s_sems[i].count = initial_count;
            os_exit_critical(primask);
            return (osSemaphoreId_t)&s_sems[i];
        }
    }
    os_exit_critical(primask);
    return 0;
}

osStatus_t osSemaphoreAcquire(osSemaphoreId_t semaphore_id, uint32_t timeout)
{
    struct os_sem *s = (struct os_sem *)semaphore_id;
    uint32_t primask;

    if (s == 0) {
        return osErrorParameter;
    }

    primask = os_enter_critical();
    if (s->count > 0u) {
        s->count--;
        os_exit_critical(primask);
        return osOK;
    }
    os_exit_critical(primask);

    if (timeout == 0u) {
        return osErrorResource;
    }
    return os_block_on(s, timeout, WK_OBJECT | WK_TIMEOUT);
}

osStatus_t osSemaphoreRelease(osSemaphoreId_t semaphore_id)
{
    struct os_sem *s = (struct os_sem *)semaphore_id;
    uint32_t primask;

    if (s == 0) {
        return osErrorParameter;
    }
    primask = os_enter_critical();
    if (s->count < s->max) {
        s->count++;
    }
    os_wake_waiters(s);
    os_exit_critical(primask);
    return osOK;
}

/******************************************************************************
 * 消息队列（定长元素）
 ******************************************************************************/
struct os_mq {
    uint8_t         *buf;
    uint32_t         msg_size;
    uint32_t         msg_count;
    volatile uint32_t head;
    volatile uint32_t tail;
    volatile uint32_t used;
};

static struct os_mq s_mqs[OS_MAX_OBJECTS];
static uint8_t s_mq_used[OS_MAX_OBJECTS];
static uint8_t s_mq_buf_pool[OS_MAX_OBJECTS][8u * 8u];  /* 原工程 8 条 x 8 字节 */

osMessageQueueId_t osMessageQueueNew(uint32_t msg_count, uint32_t msg_size,
                                     const osMessageQueueAttr_t *attr)
{
    uint32_t primask = os_enter_critical();
    uint8_t i;

    (void)attr;
    for (i = 0u; i < OS_MAX_OBJECTS; i++) {
        if (s_mq_used[i] == 0u) {
            s_mq_used[i] = 1u;
            s_mqs[i].buf = s_mq_buf_pool[i];
            s_mqs[i].msg_size = (msg_size == 0u) ? 1u : msg_size;
            if (s_mqs[i].msg_size > 8u) {
                s_mqs[i].msg_size = 8u;
            }
            s_mqs[i].msg_count = (msg_count == 0u) ? 1u : msg_count;
            if (s_mqs[i].msg_count > 8u) {
                s_mqs[i].msg_count = 8u;
            }
            s_mqs[i].head = 0u;
            s_mqs[i].tail = 0u;
            s_mqs[i].used = 0u;
            os_exit_critical(primask);
            return (osMessageQueueId_t)&s_mqs[i];
        }
    }
    os_exit_critical(primask);
    return 0;
}

osStatus_t osMessageQueueGet(osMessageQueueId_t mq_id, void *msg_ptr,
                             uint8_t *msg_prio, uint32_t timeout)
{
    struct os_mq *q = (struct os_mq *)mq_id;
    uint32_t primask;

    (void)msg_prio;
    if ((q == 0) || (msg_ptr == 0)) {
        return osErrorParameter;
    }

    primask = os_enter_critical();
    if (q->used > 0u) {
        memcpy(msg_ptr, &q->buf[q->tail * q->msg_size], q->msg_size);
        q->tail = (q->tail + 1u) % q->msg_count;
        q->used--;
        os_exit_critical(primask);
        return osOK;
    }
    os_exit_critical(primask);

    if (timeout == 0u) {
        return osErrorResource;
    }
    return os_block_on(q, timeout, WK_OBJECT | WK_TIMEOUT);
}

osStatus_t osMessageQueuePut(osMessageQueueId_t mq_id, const void *msg_ptr,
                             uint8_t msg_prio, uint32_t timeout)
{
    struct os_mq *q = (struct os_mq *)mq_id;
    uint32_t primask;

    (void)msg_prio;
    (void)timeout;
    if ((q == 0) || (msg_ptr == 0)) {
        return osErrorParameter;
    }

    primask = os_enter_critical();
    if (q->used >= q->msg_count) {
        os_exit_critical(primask);
        return osErrorResource;         /* 队满丢最新，不阻塞 */
    }
    memcpy(&q->buf[q->head * q->msg_size], msg_ptr, q->msg_size);
    q->head = (q->head + 1u) % q->msg_count;
    q->used++;
    os_wake_waiters(q);
    os_exit_critical(primask);
    return osOK;
}

/** 中断里投递：不阻塞，队满丢最新 */
osStatus_t osMessageQueuePutISR(osMessageQueueId_t mq_id, const void *msg_ptr)
{
    struct os_mq *q = (struct os_mq *)mq_id;

    if ((q == 0) || (msg_ptr == 0)) {
        return osErrorParameter;
    }
    if (q->used >= q->msg_count) {
        return osErrorResource;
    }
    memcpy(&q->buf[q->head * q->msg_size], msg_ptr, q->msg_size);
    q->head = (q->head + 1u) % q->msg_count;
    q->used++;
    os_wake_waiters(q);
    return osOK;
}

/******************************************************************************
 * 事件标志
 ******************************************************************************/
struct os_ef {
    volatile uint32_t flags;
};

static struct os_ef s_efs[OS_MAX_OBJECTS];
static uint8_t s_ef_used[OS_MAX_OBJECTS];

osEventFlagsId_t osEventFlagsNew(const osEventFlagsAttr_t *attr)
{
    uint32_t primask = os_enter_critical();
    uint8_t i;

    (void)attr;
    for (i = 0u; i < OS_MAX_OBJECTS; i++) {
        if (s_ef_used[i] == 0u) {
            s_ef_used[i] = 1u;
            s_efs[i].flags = 0u;
            os_exit_critical(primask);
            return (osEventFlagsId_t)&s_efs[i];
        }
    }
    os_exit_critical(primask);
    return 0;
}

uint32_t osEventFlagsSet(osEventFlagsId_t ef_id, uint32_t flags)
{
    struct os_ef *e = (struct os_ef *)ef_id;
    uint32_t primask;
    uint32_t prev;

    if (e == 0) {
        return 0u;
    }
    primask = os_enter_critical();
    prev = e->flags;
    e->flags |= flags;
    os_exit_critical(primask);
    return prev;
}

uint32_t osEventFlagsClear(osEventFlagsId_t ef_id, uint32_t flags)
{
    struct os_ef *e = (struct os_ef *)ef_id;
    uint32_t primask;
    uint32_t prev;

    if (e == 0) {
        return 0u;
    }
    primask = os_enter_critical();
    prev = e->flags;
    e->flags &= ~flags;
    os_exit_critical(primask);
    return prev;
}

uint32_t osEventFlagsGet(osEventFlagsId_t ef_id)
{
    struct os_ef *e = (struct os_ef *)ef_id;
    return (e == 0) ? 0u : e->flags;
}

uint32_t osEventFlagsWait(osEventFlagsId_t ef_id, uint32_t flags,
                          uint32_t options, uint32_t timeout)
{
    struct os_ef *e = (struct os_ef *)ef_id;
    uint32_t primask;

    (void)options;
    if (e == 0) {
        return 0u;
    }

    primask = os_enter_critical();
    if ((e->flags & flags) != 0u) {
        uint32_t got = e->flags & flags;
        e->flags &= ~flags;              /* 默认 osFlagsClear 语义 */
        os_exit_critical(primask);
        return got;
    }
    os_exit_critical(primask);

    if (timeout == 0u) {
        return 0u;
    }

    /* 事件标志这里按 tick 轮询等待，够本工程用（原代码也没有用它做同步） */
    {
        uint32_t start = s_tick;
        for (;;) {
            primask = os_enter_critical();
            if ((e->flags & flags) != 0u) {
                uint32_t got = e->flags & flags;
                e->flags &= ~flags;
                os_exit_critical(primask);
                return got;
            }
            os_exit_critical(primask);

            if ((timeout != osWaitForever) && ((s_tick - start) >= timeout)) {
                return 0u;
            }
            osDelay(1u);
        }
    }
}

/******************************************************************************
 * 异常处理入口
 ******************************************************************************/

/* SVC：只用于 osKernelStart 第一次切入任务 */
void SVC_Handler(void)
{
    *((volatile uint32_t *)0xE000ED04u) = (1u << 28);    /* 触发 PendSV */
}

/* PendSV：上下文切换 */
void PendSV_Handler(void)
{
    rtos_pendsv_handler();
}

/* SysTick：1ms 心跳 */
void SysTick_IRQHandler(void)
{
    osKernelTick();
}

/******************************************************************************
 * EOF
 ******************************************************************************/
