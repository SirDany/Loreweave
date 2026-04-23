import { BUILTIN_GREGORIAN, loadSaga, parseDate } from "@loreweave/core";

export async function calendarCmd(
  saga: string,
  calendarId: string,
  op: string,
  value: string,
): Promise<void> {
  if (op !== "parse") {
    console.error(`unknown op "${op}" (expected: parse)`);
    process.exit(2);
    return;
  }
  const loaded = await loadSaga(saga);
  const spec =
    calendarId === "gregorian"
      ? BUILTIN_GREGORIAN
      : loaded.calendars.find((c) => c.id === calendarId);
  if (!spec) {
    console.error(`calendar "${calendarId}" not found`);
    process.exit(1);
    return;
  }
  try {
    const parsed = parseDate(value, spec);
    console.log(JSON.stringify(parsed));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
