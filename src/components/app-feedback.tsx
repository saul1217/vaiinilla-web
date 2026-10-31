import type { ComponentProps } from 'react';
import { Feedback } from './ui';

export function AppFeedback({ toast = false, ...props }: ComponentProps<typeof Feedback> & { toast?: boolean }) {
  // Errors stay next to their operation; a toast must never be their only evidence.
  return <div className={toast && props.tone === 'success' ? 'app-feedback-toast' : undefined}><Feedback {...props} /></div>;
}
