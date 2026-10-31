export const adminOrderDateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const adminOrderPaymentMethodLabels = {
  efectivo: 'Efectivo',
  stripe: 'Tarjeta',
  saldo: 'Saldo Vaiinilla',
} as const;
