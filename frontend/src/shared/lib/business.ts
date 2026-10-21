import { plural } from './format';

export function businessAge(registrationDate: string, now = new Date()) {
  const reg = new Date(registrationDate);
  let months = (now.getFullYear() - reg.getFullYear()) * 12 + (now.getMonth() - reg.getMonth());
  if (now.getDate() < reg.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${plural(years, 'год', 'года', 'лет')}`);
  if (rest) parts.push(`${rest} ${plural(rest, 'месяц', 'месяца', 'месяцев')}`);
  return parts.join(' ') || 'меньше месяца';
}
