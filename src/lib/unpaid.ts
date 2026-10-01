/** El backend da la antigüedad de una cuenta en horas enteras. */
export function unpaidAgeLabel(hours: number): string {
  if (hours < 1) return 'hace menos de 1 h';
  return `hace ${hours} h`;
}
