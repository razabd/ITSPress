// Allows TypeScript to accept CSS side-effect imports (e.g. import './globals.css')
// and CSS Module default exports (e.g. import styles from './page.module.css')
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

// Midtrans Snap.js global
interface SnapPayOptions {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?:   (result: unknown) => void;
  onClose?:   () => void;
}

interface Snap {
  pay: (token: string, options?: SnapPayOptions) => void;
}

interface Window {
  snap: Snap;
}
