// Plain (non-"use client") module so both the server page and the client view
// get the real string (see home-service/columns.ts).
export const RESERVATION_COLUMNS =
  "id, customer_name, vehicle_type, service_type, status, payment_status, price, reservation_date, scheduled_time, arrived_at, created_at";
