// Un monto cuyos dígitos ruedan al cambiar: cada dígito es una columna 0–9 que se
// desplaza con resorte, con un leve desfase por columna. Lectores de pantalla oyen
// el monto completo, no las columnas.
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function RollingMoney({ value, suffix = ' MXN' }: { value: string; suffix?: string }) {
  const chars = `$${value}`.split('');
  return (
    <span className="rolling-money" aria-label={`$${value}${suffix}`}>
      <span aria-hidden="true">
        {chars.map((char, index) => {
          const digit = DIGITS.indexOf(char);
          // La clave cuenta desde la derecha para que centavos y unidades conserven su columna.
          const key = chars.length - index;
          if (digit < 0) return <span key={key} className="rolling-money__static">{char}</span>;
          return (
            <span key={key} className="rolling-money__column" style={{ ['--column' as string]: key }}>
              {/* El dígito actual, invisible, da el ancho real de la columna: Poppins no tiene cifras tabulares. */}
              <span className="rolling-money__sizer">{char}</span>
              <span className="rolling-money__reel" style={{ transform: `translateY(${-digit * 1.15}em)` }}>
                {DIGITS.map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          );
        })}
        {suffix}
      </span>
    </span>
  );
}
