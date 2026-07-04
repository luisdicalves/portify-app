import 'react';

declare module 'react' {
  interface CSSProperties {
    textWrap?: 'wrap' | 'nowrap' | 'balance' | 'pretty' | 'stable';
  }
}
