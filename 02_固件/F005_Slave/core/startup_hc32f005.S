/******************************************************************************
 * HC32F005C6PA - GCC startup / vector table
 * Cortex-M0+ (ARMv6-M), 32 KB Flash / 4 KB RAM
 *
 * Vector table slot names and ordering follow the official IRQn_Type enum in
 * port/hc32f005.h (PORT0=0, PORT1=1, PORT2=2, PORT3=3, UART0=6, UART1=7,
 * SPI=10, I2C=12, TIM0=14, TIM1=15, TIM2=16, ADTIM4=18, ADTIM5=19, ADTIM6=20,
 * PCA=21, WDT=22, ADC=24, VC0=26, VC1=27, LVD=28, FLASH_RAM=30, CLKTRIM=31).
 *
 * port/interrupts_hc32f005.c already supplies the real entry bodies for every
 * one of these names (each forwards to a __WEAK Xxx_IRQHandler that user code
 * may override), so no IRQ handler needs to be defined here. The weak aliases
 * below only stop the linker from failing on names that file does not emit.
 ******************************************************************************/

    .syntax unified
    .cpu cortex-m0plus
    .fpu softvfp
    .thumb

    .global  g_pfnVectors
    .global  Default_Handler

/* ---------------------------------------------------------------------------
 * Reset / initialisation
 * ------------------------------------------------------------------------ */
    .section .text.Reset_Handler
    .weak    Reset_Handler
    .type    Reset_Handler, %function
Reset_Handler:
    ldr   r0, =_sidata
    ldr   r1, =_sdata
    ldr   r2, =_edata
    movs  r3, #0
    b     LoopCopyDataInit

CopyDataInit:
    ldr   r4, [r0, r3]
    str   r4, [r1, r3]
    adds  r3, r3, #4

LoopCopyDataInit:
    adds  r4, r1, r3
    cmp   r4, r2
    bcc   CopyDataInit

    ldr   r2, =_sbss
    ldr   r4, =_ebss
    movs  r3, #0
    b     LoopFillZerobss

FillZerobss:
    str   r3, [r2]
    adds  r2, r2, #4

LoopFillZerobss:
    cmp   r2, r4
    bcc   FillZerobss

/* Set stack pointer (Cortex-M0+ has no dedicated MSP write instruction) */
    ldr   r0, =_estack
    mov   sp, r0

/* ---------------------------------------------------------------------------
 * Bring-up checkpoints.
 *
 * The SWD result block lives at 0x20000F00. Writing a distinct magic at each
 * stage lets a plain memory read (which is reliable) say exactly how far the
 * startup code got, without trusting single-step or single-register reads.
 * ------------------------------------------------------------------------ */
    ldr   r0, =0x20000F00
    ldr   r1, =0x11111111          /* stack pointer set */
    str   r1, [r0, #0]

    bl    SystemInit

    ldr   r0, =0x20000F00
    ldr   r1, =0x22222222          /* SystemInit returned */
    str   r1, [r0, #0]

    bl    __libc_init_array

    ldr   r0, =0x20000F00
    ldr   r1, =0x33333333          /* __libc_init_array returned */
    str   r1, [r0, #0]

    bl    main

    ldr   r0, =0x20000F00
    ldr   r1, =0x44444444          /* main returned (should not happen) */
    str   r1, [r0, #0]

LoopForever:
    b     LoopForever

    .size Reset_Handler, .-Reset_Handler

/* ---------------------------------------------------------------------------
 * Default handler - anything unhandled parks here
 * ------------------------------------------------------------------------ */
    .section .text.Default_Handler,"ax",%progbits
Default_Handler:
Infinite_Loop:
    b     Infinite_Loop
    .size Default_Handler, .-Default_Handler

/* ---------------------------------------------------------------------------
 * Vector table
 * ------------------------------------------------------------------------ */
    .section .isr_vector,"a",%progbits
    .type g_pfnVectors, %object
g_pfnVectors:
    .word  _estack                    /* 0x00 Top of Stack                 */
    .word  Reset_Handler              /* 0x04 Reset Handler                */
    .word  NMI_Handler                /* 0x08 NMI Handler                  */
    .word  HardFault_Handler          /* 0x0C Hard Fault Handler           */
    .word  0                          /* 0x10 Reserved                     */
    .word  0                          /* 0x14 Reserved                     */
    .word  0                          /* 0x18 Reserved                     */
    .word  0                          /* 0x1C Reserved                     */
    .word  0                          /* 0x20 Reserved                     */
    .word  0                          /* 0x24 Reserved                     */
    .word  0                          /* 0x28 Reserved                     */
    .word  SVC_Handler                /* 0x2C SVCall Handler (SVC_IRQn=-5) */
    .word  0                          /* 0x30 Reserved                     */
    .word  0                          /* 0x34 Reserved                     */
    .word  PendSV_Handler             /* 0x38 PendSV Handler (PendSV=-2)   */
    .word  SysTick_Handler            /* 0x3C SysTick Handler (SysTick=-1) */

    /* ---- External interrupts: index == IRQn ---- */
    .word  PORT0_IRQHandler           /* IRQn  0 */
    .word  PORT1_IRQHandler           /* IRQn  1 */
    .word  PORT2_IRQHandler           /* IRQn  2 */
    .word  PORT3_IRQHandler           /* IRQn  3 */
    .word  Default_Handler            /* IRQn  4 reserved */
    .word  Default_Handler            /* IRQn  5 reserved */
    .word  UART0_IRQHandler           /* IRQn  6 */
    .word  UART1_IRQHandler           /* IRQn  7 */
    .word  Default_Handler            /* IRQn  8 reserved */
    .word  Default_Handler            /* IRQn  9 reserved */
    .word  SPI_IRQHandler             /* IRQn 10 */
    .word  Default_Handler            /* IRQn 11 reserved */
    .word  I2C_IRQHandler             /* IRQn 12 */
    .word  Default_Handler            /* IRQn 13 reserved */
    .word  TIM0_IRQHandler            /* IRQn 14 */
    .word  TIM1_IRQHandler            /* IRQn 15 */
    .word  TIM2_IRQHandler            /* IRQn 16 */
    .word  Default_Handler            /* IRQn 17 reserved */
    .word  TIM4_IRQHandler            /* IRQn 18 ADTIM4 */
    .word  TIM5_IRQHandler            /* IRQn 19 ADTIM5 */
    .word  TIM6_IRQHandler            /* IRQn 20 ADTIM6 */
    .word  PCA_IRQHandler             /* IRQn 21 */
    .word  WDT_IRQHandler             /* IRQn 22 */
    .word  Default_Handler            /* IRQn 23 reserved */
    .word  ADC_IRQHandler             /* IRQn 24 */
    .word  Default_Handler            /* IRQn 25 reserved */
    .word  VC0_IRQHandler             /* IRQn 26 */
    .word  VC1_IRQHandler             /* IRQn 27 */
    .word  LVD_IRQHandler             /* IRQn 28 */
    .word  Default_Handler            /* IRQn 29 reserved */
    .word  FLASH_RAM_IRQHandler       /* IRQn 30 */
    .word  CLKTRIM_IRQHandler         /* IRQn 31 */

    .size g_pfnVectors, .-g_pfnVectors

/* ---------------------------------------------------------------------------
 * Weak aliases.
 * interrupts_hc32f005.c provides the real bodies for the peripheral entries and
 * for HardFault_Handler / SysTick_Handler, so those are intentionally NOT
 * aliased here. Only the core exceptions that file does not emit are aliased.
 * ------------------------------------------------------------------------ */
    .weak NMI_Handler
    .thumb_set NMI_Handler,Default_Handler
    .weak SVC_Handler
    .thumb_set SVC_Handler,Default_Handler
    .weak PendSV_Handler
    .thumb_set PendSV_Handler,Default_Handler
