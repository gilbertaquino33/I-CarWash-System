// App-wide editable config values.
//
// CCTV_STREAM_URL: the YOLO-processed CCTV stream served by
// backend/api.py (the /video MJPEG endpoint) while camera.py is running.
// This is the default -- it can also be changed IN THE APP on the admin
// "Live Video" screen (tap the edit icon), which persists an override to
// AsyncStorage under CCTV_STREAM_URL_KEY.
//
// NOTE: 127.0.0.1 only works on the SAME machine as the backend. From a
// phone/tablet use that PC's LAN or Tailscale IP, e.g.
//   http://192.168.1.20:8000/video   or   http://100.107.155.126:8000/video
export const DEFAULT_CCTV_STREAM_URL = 'http://100.107.155.126:8000/video';

export const CCTV_STREAM_URL_KEY = 'cctv_stream_url';
