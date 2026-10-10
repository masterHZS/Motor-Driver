/******************************************************************************
 * Copyright (C) 2019, Xiaohua Semiconductor Co.,Ltd All rights reserved.
 *
 * This software is owned and published by:
 * Xiaohua Semiconductor Co.,Ltd ("XHSC").
 *
 * This software may be replicated in part or whole for the licensed use,
 * with the restriction that this Disclaimer and Copyright notice must be
 * included with each copy of this software, whether used in part or whole,
 * at all times.
 ******************************************************************************/
/*****************************************************************************/
/*  Startup for ARM Cortex-M0+ (GNU as / GCC)                               */
/*  Target-mcu: HC32F072 (HC32F072JATA - LQFP48)                            */
/*  Adapted from the official ARMCC startup_hc32f072.s                      */
/*****************************************************************************/

    .syntax unified
    .cpu    cortex-m0plus
    .fpu    softvfp
    .thumb

/*--------------------- Vector Table ---------------------*/
    .section .isr_vector,"a",%progbits
    .align  2
    .globl  __Vectors
    .globl  __Vectors_End
    .globl  __Vectors_Size
__Vectors:
    .word   __initial_sp                       /* 0x00 Top of Stack          */
    .word   Reset_Handler                      /* 0x04 Reset Handler         */
    .word   NMI_Handler                        /* 0x08 NMI Handler           */
    .word   HardFault_Handler                  /* 0x0C Hard Fault Handler    */
    .word   0                                  /* 0x10 Reserved              */
    .word   0                                  /* 0x14 Reserved              */
    .word   0                                  /* 0x18 Reserved              */
    .word   0                                  /* 0x1C Reserved              */
    .word   0                                  /* 0x20 Reserved              */
    .word   0                                  /* 0x24 Reserved              */
    .word   0                                  /* 0x28 Reserved              */
    .word   SVC_Handler                        /* 0x2C SVCall Handler        */
    .word   0                                  /* 0x30 Reserved              */
    .word   0                                  /* 0x34 Reserved              */
    .word   PendSV_Handler                     /* 0x38 PendSV Handler        */
    .word   SysTick_Handler                    /* 0x3C SysTick Handler       */

    /* External Interrupts */
    .word   PORTA_IRQHandler                   /* 0x40 IRQ0  */
    .word   PORTB_IRQHandler                   /* 0x44 IRQ1  */
    .word   PORTC_E_IRQHandler                 /* 0x48 IRQ2  */
    .word   PORTD_F_IRQHandler                 /* 0x4C IRQ3  */
    .word   DMAC_IRQHandler                    /* 0x50 IRQ4  */
    .word   TIM3_IRQHandler                    /* 0x54 IRQ5  */
    .word   UART0_2_IRQHandler                 /* 0x58 IRQ6  */
    .word   UART1_3_IRQHandler                 /* 0x5C IRQ7  */
    .word   LPUART0_IRQHandler                 /* 0x60 IRQ8  */
    .word   LPUART1_IRQHandler                 /* 0x64 IRQ9  */
    .word   SPI0_I2S0_IRQHandler               /* 0x68 IRQ10 */
    .word   SPI1_I2S1_IRQHandler               /* 0x6C IRQ11 */
    .word   I2C0_IRQHandler                    /* 0x70 IRQ12 */
    .word   I2C1_IRQHandler                    /* 0x74 IRQ13 */
    .word   TIM0_IRQHandler                    /* 0x78 IRQ14 */
    .word   TIM1_IRQHandler                    /* 0x7C IRQ15 */
    .word   TIM2_IRQHandler                    /* 0x80 IRQ16 */
    .word   Dummy_Handler                      /* 0x84 IRQ17 Reserved */
    .word   TIM4_IRQHandler                    /* 0x88 IRQ18 */
    .word   TIM5_IRQHandler                    /* 0x8C IRQ19 */
    .word   TIM6_IRQHandler                    /* 0x90 IRQ20 */
    .word   PCA_IRQHandler                     /* 0x94 IRQ21 */
    .word   WDT_IRQHandler                     /* 0x98 IRQ22 */
    .word   Dummy_Handler                      /* 0x9C IRQ23 Reserved */
    .word   ADC_DAC_IRQHandler                 /* 0xA0 IRQ24 */
    .word   Dummy_Handler                      /* 0xA4 IRQ25 Reserved */
    .word   VC0_1_2_LVD_IRQHandler             /* 0xA8 IRQ26 */
    .word   USBFS_IRQHandler                   /* 0xAC IRQ27 */
    .word   CAN_IRQHandler                     /* 0xB0 IRQ28 */
    .word   Dummy_Handler                      /* 0xB4 IRQ29 Reserved */
    .word   FLASH_RAM_IRQHandler               /* 0xB8 IRQ30 */
    .word   CLKTRIM_CTS_IRQHandler             /* 0xBC IRQ31 */
__Vectors_End:

    .equ   __Vectors_Size, __Vectors_End - __Vectors
    .size  __Vectors, . - __Vectors


/*--------------------- Reset Handler ---------------------*/
    .section .text.Reset_Handler
    .thumb
    .thumb_func
    .align  2
    .globl  Reset_Handler
    .type   Reset_Handler, %function
Reset_Handler:
    /* Set stack pointer */
    ldr     r0, =__initial_sp
    mov     sp, r0

    /* Reset VTOR: if running from RAM (0x20000000+) set VTOR to RAM base,
       otherwise (flash) keep VTOR = 0. */
    ldr     r0, =0x20000000
    movs    r2, #0
    movs    r1, #0
    add     r1, pc                         /* R1 = current PC */
    cmp     r1, r0
    bls     .RamVtorDone
    adds    r2, r0, r2
.RamVtorDone:
    ldr     r0, =0xE000ED08                /* VTOR */
    str     r2, [r0]

    /* SystemInit() - clock/trim/hide-pin init */
    ldr     r0, =SystemInit
    blx     r0

    /* Copy .data from flash to RAM */
    ldr     r0, =_sdata
    ldr     r1, =_edata
    ldr     r2, =_sidata
    b       .DataCopyLoop
.DataCopy:
    ldr     r3, [r2]
    str     r3, [r0]
    adds    r2, #4
    adds    r0, #4
.DataCopyLoop:
    cmp     r0, r1
    blt     .DataCopy

    /* Zero .bss */
    ldr     r0, =_sbss
    ldr     r1, =_ebss
    movs    r2, #0
    b       .BssZeroLoop
.BssZero:
    str     r2, [r0]
    adds    r0, #4
.BssZeroLoop:
    cmp     r0, r1
    blt     .BssZero

    /* Call C++ static constructors */
    bl      __libc_init_array

    /* Call main */
    bl      main

.LoopForever:
    b       .LoopForever
    .size   Reset_Handler, . - Reset_Handler

/*--------------------- Default Handlers ---------------------*/
    .section .text.Dummy_Handler
    .thumb
    .thumb_func
    .align  1
    .weak   NMI_Handler
    .weak   HardFault_Handler
    .weak   SVC_Handler
    .weak   PendSV_Handler
    .weak   SysTick_Handler
    .globl  Dummy_Handler
    .type   Dummy_Handler, %function
Dummy_Handler:
    b       .
    .size   Dummy_Handler, . - Dummy_Handler

    .macro  def_irq_handler  handler_name
    .weak   \handler_name
    .thumb_set \handler_name, Dummy_Handler
    .endm

    def_irq_handler  NMI_Handler
    def_irq_handler  HardFault_Handler
    def_irq_handler  SVC_Handler
    def_irq_handler  PendSV_Handler
    def_irq_handler  SysTick_Handler

    def_irq_handler  PORTA_IRQHandler
    def_irq_handler  PORTB_IRQHandler
    def_irq_handler  PORTC_E_IRQHandler
    def_irq_handler  PORTD_F_IRQHandler
    def_irq_handler  DMAC_IRQHandler
    def_irq_handler  TIM3_IRQHandler
    def_irq_handler  UART0_2_IRQHandler
    def_irq_handler  UART1_3_IRQHandler
    def_irq_handler  LPUART0_IRQHandler
    def_irq_handler  LPUART1_IRQHandler
    def_irq_handler  SPI0_I2S0_IRQHandler
    def_irq_handler  SPI1_I2S1_IRQHandler
    def_irq_handler  I2C0_IRQHandler
    def_irq_handler  I2C1_IRQHandler
    def_irq_handler  TIM0_IRQHandler
    def_irq_handler  TIM1_IRQHandler
    def_irq_handler  TIM2_IRQHandler
    def_irq_handler  TIM4_IRQHandler
    def_irq_handler  TIM5_IRQHandler
    def_irq_handler  TIM6_IRQHandler
    def_irq_handler  PCA_IRQHandler
    def_irq_handler  WDT_IRQHandler
    def_irq_handler  ADC_DAC_IRQHandler
    def_irq_handler  VC0_1_2_LVD_IRQHandler
    def_irq_handler  USBFS_IRQHandler
    def_irq_handler  CAN_IRQHandler
    def_irq_handler  FLASH_RAM_IRQHandler
    def_irq_handler  CLKTRIM_CTS_IRQHandler

    .end
