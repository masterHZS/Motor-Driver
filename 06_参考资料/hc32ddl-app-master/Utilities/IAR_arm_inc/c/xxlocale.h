/* xxlocale.h internal header file */
/* Copyright 2013-2013 IAR Systems AB.  */

#ifndef _XXLOCALE_H
#define _XXLOCALE_H

#ifndef _SYSTEM_BUILD
  #pragma system_include
#endif

//#include <ycheck.h>
//#include <yvals.h>

//#include <xtls.h>

#if _DLIB_FULL_LOCALE_SUPPORT

//#include <wchar.h>
//#include <locale.h>
  _C_STD_BEGIN
  _EXTERN_C

  __ATTRIBUTES int _LocaleForCat(int cat);
  __ATTRIBUTES int _LocaleEncoding(void);

  /*
   * The current lconv structure.
   */
  _TLS_DATA_DECL(struct lconv, _Locale_lconv);

  _END_EXTERN_C
  _C_STD_END
#endif /* _DLIB_FULL_LOCALE_SUPPORT */
#endif /* _XXLOCALE_H */
