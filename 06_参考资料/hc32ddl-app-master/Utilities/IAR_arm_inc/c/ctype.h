/* ctype.h standard header */
/* Copyright 2003-2010 IAR Systems AB. */
#ifndef _CTYPE
#define _CTYPE

#ifndef _SYSTEM_BUILD
  #pragma system_include
#endif

#include <ycheck.h>
#include <yvals.h>


#if __AEABI_PORTABILITY_INTERNAL_LEVEL
  #ifndef __AEABI_PORTABLE
    #define __AEABI_PORTABLE
  #endif
#else /* __AEABI_PORTABILITY_INTERNAL_LEVEL */
  #if !defined(_NO_DEFINITIONS_IN_HEADER_FILES)
    #include <xlocale.h>
  #endif
#endif /* __AEABI_PORTABILITY_INTERNAL_LEVEL */

/* Module consistency. */
#pragma rtmodel="__dlib_full_locale_support", \
  _STRINGIFY(_DLIB_FULL_LOCALE_SUPPORT)

_C_STD_BEGIN

_C_LIB_DECL
         __ATTRIBUTES int isalnum(int);
         __ATTRIBUTES int isalpha(int);
#if _DLIB_ADD_C99_SYMBOLS
         __ATTRIBUTES int isblank(int);
#endif /* _DLIB_ADD_C99_SYMBOLS */
         __ATTRIBUTES int iscntrl(int);
__EFF_NE __ATTRIBUTES int isdigit(int);
         __ATTRIBUTES int isgraph(int);
         __ATTRIBUTES int islower(int);
         __ATTRIBUTES int isprint(int);
         __ATTRIBUTES int ispunct(int);
         __ATTRIBUTES int isspace(int);
         __ATTRIBUTES int isupper(int);
__EFF_NE __ATTRIBUTES int isxdigit(int);
         __ATTRIBUTES int tolower(int);
         __ATTRIBUTES int toupper(int);
_END_C_LIB_DECL

/* Aeabi table constants */
#define __A   1 /* alphabetic */
#define __X   2 /* A-F, a-f and 0-9 */
#define __P   4 /* punctuation */
#define __B   8 /* blank */
#define __S  16 /* white space */
#define __L  32 /* lower case letters */
#define __U  64 /* upper case letters */
#define __C 128 /* control chars */

#if !defined(_NO_DEFINITIONS_IN_HEADER_FILES)
  #if !__AEABI_PORTABILITY_INTERNAL_LEVEL
    #if _DLIB_ADD_C99_SYMBOLS
      #pragma inline=no_body
      int isblank(int _C)
      {
        return (   _C == ' '
                || _C == '\t'
                || isspace(_C));
      }
    #endif /* _DLIB_ADD_C99_SYMBOLS */

    #pragma inline=no_body
    int isdigit(int _C)
    {
      return _C >= '0' && _C <= '9';
    }

    #pragma inline=no_body
    int isxdigit(int _C)
    {
      return (   (_C >= 'a' && _C <= 'f')
              || (_C >= 'A' && _C <= 'F')
              || isdigit(_C));
    }

    #pragma inline=no_body
    int isalnum(int _C)
    {
      return (   isalpha(_C)
              || isdigit(_C));
    }

    #pragma inline=no_body
    int isprint(int _C)
    {
      return (   (_C >= ' ' && _C <= '\x7e')
              || isalpha(_C)
              || ispunct(_C));
    }

    #pragma inline=no_body
    int isgraph(int _C)
    {
      return (   _C != ' '
              && isprint(_C));
    }
  #else /* !__AEABI_PORTABILITY_INTERNAL_LEVEL */
    #if defined(__AEABI_BIND_STATICALLY) && __AEABI_BIND_STATICALLY
      /* We only have the default table (ASCII only) */
      _C_LIB_DECL
      _DLIB_CONST_ATTR extern char const __aeabi_ctype_table_[257];
      _DLIB_CONST_ATTR extern char const __aeabi_ctype_table_C[257];
      _END_C_LIB_DECL
      #ifdef _AEABI_LC_CTYPE
        #define __aeabi_ctype_table _GLUE(__aeabi_ctype_table_, _AEABI_LC_CTYPE)
      #else
        #define __aeabi_ctype_table __aeabi_ctype_table_
      #endif

      #ifdef __cplusplus
        #pragma inline=no_body
        int isdigit(int _C)
        {
          return _C >= '0' && _C <= '9';
        }

        #pragma inline=no_body
        int isspace (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __S;
        }
        #pragma inline=no_body
        int isalpha (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __A;
        }
        #pragma inline=no_body
        int isalnum (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & (__A | __X);
        }
        #pragma inline=no_body
        int isprint (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & (__A | __X | __P | __B);
        }
        #pragma inline=no_body
        int isupper (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __U;
        }
        #pragma inline=no_body
        int islower (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __L;
        }
        #pragma inline=no_body
        int isxdigit(int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __X;
        }
        #if _DLIB_ADD_C99_SYMBOLS
          #pragma inline=no_body
          int isblank (int _C)
          {
            return _CSTD __aeabi_ctype_table[_C + 1] & __B;
          }
        #endif /* _DLIB_ADD_C99_SYMBOLS */
        #pragma inline=no_body
        int isgraph (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & (__A | __X | __P);
        }
        #pragma inline=no_body
        int iscntrl (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __C;
        }
        #pragma inline=no_body
        int ispunct (int _C)
        {
          return _CSTD __aeabi_ctype_table[_C + 1] & __P;
        }

        #pragma inline=no_body
        int tolower(int _C)
        {
          return isupper(_C) ? (_C + ('A' - 'a')) : _C;
        }
        #pragma inline=no_body
        int toupper(int _C)
        {
          return islower(_C) ? (_C + ('a' - 'A')) : _C;
        }
      #else /* __cplusplus */
        #define isdigit(_C) (((unsigned int)(_C) - '0') < 10)

        #define isspace(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & __S)
        #define isalpha(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & __A)
        #define isalnum(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & (__A | __X))
        #define isprint(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & \
                                                               (__A|__X|__P|__B))
        #define isupper(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & __U)
        #define islower(_C)  (_CSTD __aeabi_ctype_table[(_C) + 1] & __L)
        #define isxdigit(_C) (_CSTD __aeabi_ctype_table[(_C) + 1] & __X)
        #if _DLIB_ADD_C99_SYMBOLS
          #define isblank(_C) (_CSTD __aeabi_ctype_table[(_C) + 1] & __B)
        #endif /* _DLIB_ADD_C99_SYMBOLS */
        #define isgraph(_C) (_CSTD __aeabi_ctype_table[(_C) + 1] & \
                                                              (__A | __X | __P))
        #define iscntrl(_C) (_CSTD __aeabi_ctype_table[(_C) + 1] & __C)
        #define ispunct(_C) (_CSTD __aeabi_ctype_table[(_C) + 1] & __P)

        #define tolower(_C) __iar_tolower(_C)
        #pragma inline=no_body
        int __iar_tolower(int _C)
        {
          return isupper(_C) ? (_C + ('A' - 'a')) : _C;
        }
        #define toupper(_C) __iar_toupper(_C)
        #pragma inline=no_body
        int __iar_toupper(int _C)
        {
          return islower(_C) ? (_C + ('a' - 'A')) : _C;
        }
      #endif /* __cplusplus */

    #endif /* __AEABI_BIND_STATICALLY */
    
  #endif /* !__AEABI_PORTABILITY_INTERNAL_LEVEL */

#endif /* !defined(_NO_DEFINITIONS_IN_HEADER_FILES) */

#if !defined(_NO_DEFINITIONS_IN_HEADER_FILES)

  #if !__AEABI_PORTABILITY_INTERNAL_LEVEL

    #if _DLIB_FULL_LOCALE_SUPPORT

      /* In full support locale mode proxy functions are defined in each
       * source file. */

    #else /* _DLIB_FULL_LOCALE_SUPPORT */

      /* In non-full mode we redirect the corresponding locale function. */
      _EXTERN_C
      extern int _LOCALE_WITH_USED(toupper)(int);
      extern int _LOCALE_WITH_USED(tolower)(int);
      extern int _LOCALE_WITH_USED(isalpha)(int);
      extern int _LOCALE_WITH_USED(iscntrl)(int);
      extern int _LOCALE_WITH_USED(islower)(int);
      extern int _LOCALE_WITH_USED(ispunct)(int);
      extern int _LOCALE_WITH_USED(isspace)(int);
      extern int _LOCALE_WITH_USED(isupper)(int);
      _END_EXTERN_C

      #pragma inline=no_body
      int toupper(int _C)
      {
        return _LOCALE_WITH_USED(toupper)(_C);
      }

      #pragma inline=no_body
      int tolower(int _C)
      {
        return _LOCALE_WITH_USED(tolower)(_C);
      }

      #pragma inline=no_body
      int isalpha(int _C)
      {
       return _LOCALE_WITH_USED(isalpha)(_C);
      }

      #pragma inline=no_body
      int iscntrl(int _C)
      {
        return _LOCALE_WITH_USED(iscntrl)(_C);
      }

      #pragma inline=no_body
      int islower(int _C)
      {
        return _LOCALE_WITH_USED(islower)(_C);
      }

      #pragma inline=no_body
      int ispunct(int _C)
      {
        return _LOCALE_WITH_USED(ispunct)(_C);
      }

      #pragma inline=no_body
      int isspace(int _C)
      {
        return _LOCALE_WITH_USED(isspace)(_C);
      }

      #pragma inline=no_body
      int isupper(int _C)
      {
        return _LOCALE_WITH_USED(isupper)(_C);
      }

    #endif /* _DLIB_FULL_LOCALE_SUPPORT */

  #endif /* !__AEABI_PORTABILITY_INTERNAL_LEVEL */

#endif /* !defined(_NO_DEFINITIONS_IN_HEADER_FILES) */  
  
  
_C_STD_END
#endif /* _CTYPE */

#ifdef _STD_USING
  using _CSTD isalnum; using _CSTD isalpha; using _CSTD iscntrl;
  using _CSTD isdigit; using _CSTD isgraph; using _CSTD islower;
  using _CSTD isprint; using _CSTD ispunct; using _CSTD isspace;
  using _CSTD isupper; using _CSTD isxdigit; using _CSTD tolower;
  using _CSTD toupper;
  #if _DLIB_ADD_C99_SYMBOLS
    using _CSTD isblank;
  #endif /* _DLIB_ADD_C99_SYMBOLS */

  #if !defined(_NO_DEFINITIONS_IN_HEADER_FILES)
    #if __AEABI_PORTABILITY_INTERNAL_LEVEL 
      #if defined(__AEABI_BIND_STATICALLY) && __AEABI_BIND_STATICALLY
        using _CSTD __aeabi_ctype_table_;
        using _CSTD __aeabi_ctype_table_C;
      #endif
    #endif
  #endif
#endif /* _STD_USING */

/*
 * Copyright (c) 1992-2009 by P.J. Plauger.  ALL RIGHTS RESERVED.
 * Consult your license regarding permissions and restrictions.
V5.04:0576 */
