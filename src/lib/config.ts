// App-wide editable config values.
//
// CCTV_STREAM_URL: the YOLO-processed CCTV stream served by
// backend/api.py (the /video MJPEG endpoint) while camera.py is running.
// This is the default -- it can also be changed IN THE APP on the admin
// "Live Video" screen (tap the edit icon), which persists an override to
// AsyncStorage under CCTV_STREAM_URL_KEY.
//
// The default is the backend PC's TAILSCALE IP, on purpose: a Tailscale
// address is tied to the machine, not to the network it happens to be on,
// so the stream keeps working when that PC moves to another Wi-Fi / hotspot
// and it works from anywhere, not just the same LAN. The only requirement
// is that Tailscale is running on both the backend PC and this device.
//
// A LAN IP (e.g. http://192.168.1.20:8001/video) also works, but ONLY while
// both devices sit on the same router, and it changes on every reconnect.
// 127.0.0.1 only works on the SAME machine as the backend.
//
// Port must match the one uvicorn is bound to -- see backend/start-backend.ps1.
export const DEFAULT_CCTV_STREAM_URL = 'http://100.107.155.126:8001/video';

export const CCTV_STREAM_URL_KEY = 'cctv_stream_url';
