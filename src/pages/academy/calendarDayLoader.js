export function createCalendarDayLoader(fetchDay) {
  if (typeof fetchDay !== 'function') throw new TypeError('fetchDay must be a function.');
  let requestVersion = 0;

  return {
    async load(date) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new TypeError('date must use YYYY-MM-DD format.');
      }
      const version = ++requestVersion;
      try {
        const response = await fetchDay(date);
        return { date, response, error: null, stale: version !== requestVersion };
      } catch (error) {
        return { date, response: null, error, stale: version !== requestVersion };
      }
    },
    cancel() {
      requestVersion += 1;
    },
  };
}
