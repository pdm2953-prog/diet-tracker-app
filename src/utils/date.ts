export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export type CalendarMonth = {
  year: number;
  month: number;
};

export type CalendarMonthCell = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  month: number;
  weekdayIndex: number;
  weekIndex: number;
  year: number;
};

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CALENDAR_GRID_CELL_COUNT = 42;

export function formatDateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getLocalDateString(): string {
  return formatDateToLocalDateString(new Date());
}

export function parseLocalDateString(date: string): LocalDateParts | null {
  const match = LOCAL_DATE_PATTERN.exec(date);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year
    || parsedDate.getMonth() !== month - 1
    || parsedDate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidLocalDateString(date: string): boolean {
  return parseLocalDateString(date) !== null;
}

export function formatLocalDateParts(
  year: number,
  month: number,
  day: number,
): string {
  return formatDateToLocalDateString(new Date(year, month - 1, day));
}

export function shiftLocalDateString(date: string, dayDelta: number): string {
  const parts = parseLocalDateString(date);

  if (parts === null) {
    return getLocalDateString();
  }

  return formatDateToLocalDateString(
    new Date(parts.year, parts.month - 1, parts.day + dayDelta),
  );
}

export function getCalendarMonthFromDate(date: string): CalendarMonth {
  const parts = parseLocalDateString(date) ?? parseLocalDateString(getLocalDateString());

  if (parts === null) {
    return {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    };
  }

  return {
    year: parts.year,
    month: parts.month,
  };
}

export function shiftCalendarMonth(
  month: CalendarMonth,
  monthDelta: number,
): CalendarMonth {
  const shifted = new Date(month.year, month.month - 1 + monthDelta, 1);

  return {
    year: shifted.getFullYear(),
    month: shifted.getMonth() + 1,
  };
}

export function buildCalendarMonthGrid(
  year: number,
  month: number,
): CalendarMonthCell[] {
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const firstWeekdayIndex = firstDayOfMonth.getDay();

  return Array.from({ length: CALENDAR_GRID_CELL_COUNT }, (_, index) => {
    const cellDate = new Date(year, month - 1, 1 + index - firstWeekdayIndex);
    const cellYear = cellDate.getFullYear();
    const cellMonth = cellDate.getMonth() + 1;
    const cellDay = cellDate.getDate();

    return {
      date: formatDateToLocalDateString(cellDate),
      day: cellDay,
      isCurrentMonth: cellYear === year && cellMonth === month,
      month: cellMonth,
      weekdayIndex: index % 7,
      weekIndex: Math.floor(index / 7),
      year: cellYear,
    };
  });
}

export function compareLocalDateStrings(firstDate: string, secondDate: string): number {
  if (firstDate === secondDate) {
    return 0;
  }

  return firstDate < secondDate ? -1 : 1;
}

export function isFutureLocalDate(date: string, todayDate: string): boolean {
  return compareLocalDateStrings(date, todayDate) > 0;
}

export function resolveSelectedCalendarDate(
  nextDate: string,
  currentDate: string,
): string {
  return isValidLocalDateString(nextDate) ? nextDate : currentDate;
}
