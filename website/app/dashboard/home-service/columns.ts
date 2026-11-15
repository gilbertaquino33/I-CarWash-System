// Plain (non-"use client") module so both the server page and the client view
// get the real string. A value exported from a "use client" file reaches a
// server component as a client reference, not the string -- which crashed
// the page's Supabase query.
export const HOME_SERVICE_COLUMNS =
  "id, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_status, price";
