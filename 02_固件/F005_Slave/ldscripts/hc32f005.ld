/******************************************************************************
 * HC32F005C6PA - GNU LD linker script
 * MCU  : HC32F005C6PA (ARM Cortex-M0+, TSSOP-20)
 * Flash: 0x00000000 - 0x00007FFF (32 KByte)
 * RAM  : 0x20000000 - 0x20000FFF (4 KByte)
 ******************************************************************************/

/* Entry Point */
ENTRY(Reset_Handler)

/* Memory regions */
MEMORY
{
    FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 32K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 4K
}

/* Stack & Heap sizes (4K RAM is tight - keep them small) */
STACK_SIZE = 0x200;     /* 512 Byte  */
HEAP_SIZE  = 0x000;     /* no heap   */

/* Top of stack is at the top of RAM */
__StackTop    = ORIGIN(RAM) + LENGTH(RAM);
__initial_sp  = __StackTop;
__StackLimit  = __StackTop - STACK_SIZE;
_estack       = __StackTop;

PROVIDE(_estack = __StackTop);

SECTIONS
{
    /* Vector table, placed at address 0 */
    .isr_vector :
    {
        . = ALIGN(4);
        KEEP(*(.isr_vector))
        . = ALIGN(4);
    } >FLASH

    /* Program code */
    .text :
    {
        . = ALIGN(4);
        *(.text)
        *(.text*)
        KEEP(*(.init))
        KEEP(*(.fini))
        . = ALIGN(4);
        _etext = .;
    } >FLASH

    /* Constant data */
    .rodata :
    {
        . = ALIGN(4);
        *(.rodata)
        *(.rodata*)
        . = ALIGN(4);
    } >FLASH

    .ARM.extab :
    {
        *(.ARM.extab* .gnu.linkonce.armextab.*)
    } >FLASH

    .ARM :
    {
        __exidx_start = .;
        *(.ARM.exidx*)
        __exidx_end = .;
    } >FLASH

    .preinit_array :
    {
        . = ALIGN(4);
        PROVIDE_HIDDEN (__preinit_array_start = .);
        KEEP (*(.preinit_array*))
        PROVIDE_HIDDEN (__preinit_array_end = .);
    } >FLASH

    .init_array :
    {
        . = ALIGN(4);
        PROVIDE_HIDDEN (__init_array_start = .);
        KEEP (*(SORT(.init_array.*)))
        KEEP (*(.init_array*))
        PROVIDE_HIDDEN (__init_array_end = .);
    } >FLASH

    .fini_array :
    {
        . = ALIGN(4);
        PROVIDE_HIDDEN (__fini_array_start = .);
        KEEP (*(SORT(.fini_array.*)))
        KEEP (*(.fini_array*))
        PROVIDE_HIDDEN (__fini_array_end = .);
    } >FLASH

    /* Load address of initialized data (.data) in flash */
    _sidata = LOADADDR(.data);

    /* Initialized data, copied to RAM by startup */
    .data :
    {
        . = ALIGN(4);
        _sdata = .;
        *(.data)
        *(.data*)
        . = ALIGN(4);
        _edata = .;
    } >RAM AT> FLASH

    /* Zero-initialized data */
    .bss :
    {
        . = ALIGN(4);
        _sbss = .;
        __bss_start__ = _sbss;
        *(.bss)
        *(.bss*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
        __bss_end__ = _ebss;
    } >RAM

    /* Heap: starts after .bss, grows upward toward the stack */
    .heap (NOLOAD) :
    {
        . = ALIGN(8);
        __heap_base = .;
        PROVIDE ( end = . );
        PROVIDE ( _end = . );
        . = . + HEAP_SIZE;
        __heap_limit = .;
    } >RAM

    ASSERT(__heap_limit <= __StackLimit, "region RAM overflowed with stack and heap")
}
