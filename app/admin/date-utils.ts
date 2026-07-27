export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function addDays(value: string, days: number) {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function startOfWeek(value: string) {
  const date = dateFromIso(value);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return localIsoDate(date);
}

export function prettyDay(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("pt-PT", options).format(dateFromIso(value));
}
