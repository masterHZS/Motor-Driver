#define AMX_FIFO_C
#include "amx_fifo.h"

void amx_fifo_init(amx_fifo_t *fifo, uint8_t *buf, uint16_t bufsize)
{
	fifo->size = bufsize;
	fifo->read_pointer = 0;
	fifo->write_pointer = 0;
	fifo->buffer = buf;
}

void amx_fifo_write(amx_fifo_t *fifo,uint8_t data)
{
	fifo->buffer[fifo->write_pointer++] = data;
	if(fifo->write_pointer >=  fifo->size )
	{
		fifo->write_pointer = 0;
	}
}

uint8_t amx_fifo_read(amx_fifo_t *fifo)
{
	uint8_t data = 0;
	
	data = fifo->buffer[fifo->read_pointer++];
	if(fifo->read_pointer >=  fifo->size )
	{
		fifo->read_pointer = 0;
	}
	return data;
}

uint16_t amx_fifo_count(amx_fifo_t *fifo)
{
	int16_t temp = 0;

	temp = fifo->write_pointer - fifo->read_pointer;
	if(fifo->write_pointer < fifo->read_pointer)
	{
		temp = temp + fifo->size;
	}
	return temp;
}

uint8_t amx_fifo_getvalue(amx_fifo_t *fifo)
{
	uint8_t data = 0;
	
	data = fifo->buffer[fifo->write_pointer - 1];
	return data;
}

uint8_t amx_fifo_getvalueback(amx_fifo_t *fifo)
{
	uint8_t data = 0;
	
	data = fifo->buffer[--fifo->write_pointer];
	return data;
}

