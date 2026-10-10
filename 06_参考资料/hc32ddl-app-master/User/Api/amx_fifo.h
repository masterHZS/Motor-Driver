#ifndef __AMX_FIFO_H
#define __AMX_FIFO_H

#include "common.h"

#ifdef AMX_FIFO_C
#define AMX_FIFO_EXT
#else
#define AMX_FIFO_EXT extern
#endif

typedef struct
{
	uint16_t	size;
	int32_t 	write_pointer;
	int32_t 	read_pointer;
	uint8_t		*buffer;//buffer[MAX_FIFO_SIZE];
}amx_fifo_t;

AMX_FIFO_EXT void amx_fifo_init( amx_fifo_t *fifo, uint8_t *buf, uint16_t bufsize);
AMX_FIFO_EXT void amx_fifo_write(amx_fifo_t *fifo,uint8_t data);
AMX_FIFO_EXT uint8_t amx_fifo_read(amx_fifo_t *fifo);
AMX_FIFO_EXT uint16_t amx_fifo_count(amx_fifo_t *fifo);
AMX_FIFO_EXT uint8_t amx_fifo_getvalue(amx_fifo_t *fifo);
AMX_FIFO_EXT uint8_t amx_fifo_getvalueback(amx_fifo_t *fifo);

#endif /* __AMX_FIFO_H */
