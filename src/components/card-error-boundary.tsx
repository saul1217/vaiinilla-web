import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Feedback } from './ui';

interface Props {
  label: string;
  children: ReactNode;
}

/** Si una tarjeta falla al pintarse, solo ella muestra un aviso y el resto de la pantalla sigue. */
export class CardErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Falló la tarjeta ${this.props.label}`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <Feedback tone="error">No se pudo mostrar «{this.props.label}».</Feedback>;
    return this.props.children;
  }
}
