import { Redirect } from 'react-router-dom';
import { Spinner } from '../components/brand-mark';

/**
 * Stripe returns here after an Account Link finishes. The platform guard on
 * the destination keeps the current Super Admin session when it is alive and
 * sends the user to the dedicated Super Admin login when it is not.
 */
export function StripeOnboardingReturnPage() {
  return (
    <>
      <Redirect to="/plataforma/establecimientos" />
      <div className="grid min-h-screen place-items-center bg-cream text-ink" role="status">
        <span className="inline-flex items-center gap-3 font-semibold">
          <Spinner /> Regresando al panel de Super Admin…
        </span>
      </div>
    </>
  );
}
