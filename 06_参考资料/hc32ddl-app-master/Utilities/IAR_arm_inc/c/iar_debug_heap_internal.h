#ifndef __IAR_DEBUG_HEAP_INTERNAL__
#define __IAR_DEBUG_HEAP_INTERNAL__

#include <ysizet.h>   /* for size_t */


#include "__dbg_rtc_report.h"

#ifndef __RTC_FUNCTION_ATTRIBUTES__
#define __RTC_FUNCTION_ATTRIBUTES__
#endif // !__RTC_FUNCTION_ATTRIBUTES__

typedef enum { kMallocAllocated = 0, /* allocated by malloc */
               kNewAllocated,        /* allocated by new    */
               kNewArrayAllocated,   /* allocated by new[]  */
               kSmallSizedDelayed    /* zero sized and delayed */
} DhAllocType;

#define GUARD_SIZE (4)
#define FILL_SIZE  (4)
#define HEADER_ALIGNMENT (8)

#define kHeaderUnits     (  sizeof(struct heap_info_block) / HEADER_ALIGNMENT \
                          + sizeof(struct heap_info_block) % HEADER_ALIGNMENT)
#define kHeaderSize      (kHeaderUnits * HEADER_ALIGNMENT)
#define kFooterUnits     (1)
#define kFooterSize      (kFooterUnits * HEADER_ALIGNMENT)
#define kAdditionalSpace (kHeaderSize + kFooterSize)

/* *************************************************************************
 32-bit        address of caller
  2-bit        allocation type
 30-bit        block ID-number
  1-bit        flag to mark block as ignored by leak checker.
 31-bit        offset to footer
 32-bit        guard
  X-bit        payload
 32-bit        guard (at least 4 bytes, but looped until the end of the block)
  Y-bit        guard looped
   ************************************************************************* */

#pragma language=save
#pragma language=extended

typedef struct heap_info_block
{
  size_t      caller_address;        
  DhAllocType alloc_type       : 2;
  size_t      block_id_number  : 30;
  size_t      leak_ignore_mark : 1;  /* ignored by leak checker. */
  size_t      leak_queued      : 1;  /* queued for leak check. */
  size_t      offset_to_footer : 30; /* from start of struct, not the payload*/
  char        guard[GUARD_SIZE];
} heap_info_block;

#pragma language=restore

#define LINKER_IMPORT(x,t) extern int __iar_##x; \
                           static __inited t x = (t)(&__iar_##x)

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

size_t __iar_debug_check_dlmalloc_block(void * start,      void * end,
                                        size_t used_bytes, void * arg);

extern void __iar_debug_dlmalloc_inspect_all(size_t(*h)(void*,void *,size_t,void*),void*a);
extern void __iar_debug_check_heap_integrity_work(size_t ret_addr);
extern void __iar_debug_dlfree(void *, size_t, DhAllocType, char);
extern void __iar_debug_check_heap_integrity(void);

struct malloc_state;
extern int __iar_debug_address_is_ok(struct malloc_state * m, void * addr);

extern char const * __iar_debug_get_guard(void);

extern size_t __iar_debug_delayed_free_limit(void);
extern size_t __iar_debug_delayed_current_count(void);

#ifdef __cplusplus
}
#endif /* __cplusplus */


#endif /* __IAR_DEBUG_HEAP_INTERNAL__ */
