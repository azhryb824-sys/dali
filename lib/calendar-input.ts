export type CalendarType = "date" | "datetime-local" | "month";
export function calendarCandidate(type:CalendarType, day:string, time:string, min:string, max:string) {
  let value=type === "month" ? day.slice(0,7) : type === "datetime-local" ? `${day}T${time || "00:00"}` : day;
  if(min && value<min) value=min;
  if(max && value>max) value=max;
  return value;
}
export function setCalendarInputValue(input:HTMLInputElement,value:string) {
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
  if(!setter) return;
  setter.call(input,value);
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
