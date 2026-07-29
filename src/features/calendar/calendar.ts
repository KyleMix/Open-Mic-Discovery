import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

/**
 * "Add to calendar" for a mic night. On iOS and Android this opens the
 * system event sheet (Apple Calendar or Google Calendar, whatever the
 * person uses) prefilled and ready to save, so it lands like an invite.
 * On web it opens the Google Calendar template page. No calendar
 * permissions are requested; the system UI owns the write.
 */

export type CalendarEventInput = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  notes: string;
};

function googleStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
}

/** The Google Calendar "create event" template URL, used on web. */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${googleStamp(event.startsAt)}/${googleStamp(event.endsAt)}`,
    location: event.location,
    details: event.notes,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function addToCalendar(event: CalendarEventInput): Promise<void> {
  if (Platform.OS === 'web') {
    await Linking.openURL(googleCalendarUrl(event));
    return;
  }
  await Calendar.createEventInCalendarAsync({
    title: event.title,
    startDate: event.startsAt,
    endDate: event.endsAt,
    location: event.location,
    notes: event.notes,
  });
}
