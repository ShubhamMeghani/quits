import { todayIST as today } from "@/lib/currency";
import { addDays } from "@/lib/recurring";

export const todayIST = () => today();
export const addDaysSafe = (date: string, days: number) => addDays(date, days);
