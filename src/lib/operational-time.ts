const OPERATION_TIME_ZONE = "America/Maceio";

export function operationalDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    monthNumber: Number(values.month),
    day: Number(values.day),
    month: `${values.year}-${values.month}`,
    date: `${values.year}-${values.month}-${values.day}`,
  };
}

export function operationalYear(date = new Date()) {
  return operationalDateParts(date).year;
}

export function operationalDate(date = new Date()) {
  return operationalDateParts(date).date;
}

export function operationalMonth(date = new Date()) {
  return operationalDateParts(date).month;
}

/**
 * Soma dias a uma data operacional YYYY-MM-DD sem depender do fuso do navegador.
 * O cálculo usa UTC apenas como aritmética de calendário para a data já resolvida
 * em America/Maceio; não representa um instante operacional persistido.
 */
export function addOperationalDays(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) {
    throw new Error("Data operacional inválida");
  }
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("Data operacional inválida");
  }
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export { OPERATION_TIME_ZONE };
