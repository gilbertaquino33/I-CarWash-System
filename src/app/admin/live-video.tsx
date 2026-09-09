import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CCTV_STREAM_URL_KEY, DEFAULT_CCTV_STREAM_URL } from '../../lib/config';

// In-card preview: the live feed, heavily BLURRED (so it's never a plain
// black box), and if the backend is unreachable it fades to an animated
// dark sheen instead of black. Tapping the card opens the full, un-blurred
// stream in the browser.
function buildPreviewHTML(streamUrl: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0b1220; }
    #wrap { position: absolute; inset: 0; }
    #feed {
      width: 100%; height: 100%; object-fit: cover; display: block;
      filter: blur(8px) brightness(0.72) saturate(1.05);
      transform: scale(1.15);
    }
    #fallback {
      position: absolute; inset: 0; display: none;
      background: linear-gradient(135deg, #0b1220, #1f2937, #0b1220);
      background-size: 300% 300%;
      animation: sheen 7s ease infinite;
      align-items: center; justify-content: center;
    }
    #fallback .dot {
      width: 66px; height: 66px; border-radius: 50%;
      background: rgba(255,255,255,0.06);
      display: flex; align-items: center; justify-content: center;
      filter: blur(0.4px);
    }
    #fallback .dot::before {
      content: ""; width: 26px; height: 18px; border-radius: 4px;
      background: rgba(255,255,255,0.28);
      box-shadow: 20px 0 0 -4px rgba(255,255,255,0.28);
    }
    @keyframes sheen {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  </style>
</head>
<body>
  <div id="wrap">
    <img id="feed" src="${streamUrl}" />
    <div id="fallback"><div class="dot"></div></div>
  </div>
  <script>
    var feed = document.getElementById('feed');
    var fb = document.getElementById('fallback');
    function showFallback() { feed.style.display = 'none'; fb.style.display = 'flex'; }
    function showFeed() { feed.style.display = 'block'; fb.style.display = 'none'; }
    feed.onerror = showFallback;
    feed.onload = showFeed;
    setInterval(function () {
      if (fb.style.display === 'flex') {
        feed.style.display = 'block';
        feed.src = '${streamUrl}' + (('${streamUrl}'.indexOf('?') === -1) ? '?' : '&') + 't=' + Date.now();
      }
    }, 5000);
  </script>
</body>
</html>
`;
}

export default function LiveVideoScreen() {
  const [streamUrl, setStreamUrl] = useState(DEFAULT_CCTV_STREAM_URL);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(CCTV_STREAM_URL_KEY);
        if (saved && saved.trim()) setStreamUrl(saved.trim());
      } catch {
        // keep default
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const openStream = async () => {
    try {
      await WebBrowser.openBrowserAsync(streamUrl);
    } catch {
      Linking.openURL(streamUrl).catch(() => {});
    }
  };

  const openEditor = () => {
    setDraft(streamUrl);
    setEditing(true);
  };

  const saveUrl = async () => {
    const next = draft.trim();
    if (!/^https?:\/\/.+/i.test(next)) return; // must be a real URL
    setStreamUrl(next);
    setEditing(false);
    try {
      await AsyncStorage.setItem(CCTV_STREAM_URL_KEY, next);
    } catch {
      // best effort
    }
  };

  const resetUrl = async () => {
    setStreamUrl(DEFAULT_CCTV_STREAM_URL);
    setDraft(DEFAULT_CCTV_STREAM_URL);
    try {
      await AsyncStorage.removeItem(CCTV_STREAM_URL_KEY);
    } catch {
      // best effort
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Video</Text>
          <Text style={styles.subtitle}>CCTV Monitoring</Text>
        </View>

        <TouchableOpacity onPress={openEditor} style={styles.backButton}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* VIDEO AREA */}
      <View style={styles.videoContainer}>
        <View style={styles.videoCard}>
          {ready && (
            <WebView
              key={streamUrl}
              source={{ html: buildPreviewHTML(streamUrl), baseUrl: streamUrl }}
              style={styles.video}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              scrollEnabled={false}
              bounces={false}
              pointerEvents="none"
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* LIVE INDICATOR */}
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          {/* TAP-TO-OPEN overlay (captures the whole card) */}
          <TouchableOpacity style={styles.tapOverlay} activeOpacity={0.8} onPress={openStream}>
            <View style={styles.tapPill}>
              <Ionicons name="expand-outline" size={16} color="#fff" />
              <Text style={styles.tapPillText}>Tap to view live feed</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* INFO */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="videocam" size={20} color="#2563EB" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>CCTV Monitoring</Text>
              <Text style={styles.infoText}>
                 Tap the preview to open the
                full live feed.
              </Text>
            </View>
          </View>

          <View style={styles.urlRow}>
            <Ionicons name="link-outline" size={14} color="#9AA1AC" />
            <Text style={styles.urlText} numberOfLines={1}>
              {streamUrl}
            </Text>
            <TouchableOpacity onPress={openEditor}>
              <Text style={styles.urlEditLink}>Edit</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.openBtn} onPress={openStream} activeOpacity={0.85}>
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={styles.openBtnText}>Open Live Feed</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* EDIT URL MODAL */}
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CCTV Stream URL</Text>
            <Text style={styles.modalHint}>
              The /video endpoint from your backend. Use the PC's LAN or Tailscale IP, e.g.
              http://100.107.155.126:8000/video
            </Text>
            <TextInput
              style={styles.modalInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="http://...:8000/video"
              placeholderTextColor="#9AA1AC"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={resetUrl}>
                <Text style={styles.modalBtnGhostText}>Reset to default</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setEditing(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveUrl}>
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },

  header: {
    backgroundColor: '#1A1D21',
    paddingTop: 55,
    paddingBottom: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  subtitle: {
    color: '#9AA1AC',
    fontSize: 12,
    marginTop: 2,
  },

  videoContainer: {
    padding: 16,
  },

  videoCard: {
    height: 240,
    backgroundColor: '#0b1220',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },

  video: {
    flex: 1,
    backgroundColor: '#0b1220',
  },

  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    marginRight: 6,
  },

  liveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  tapPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  infoCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },

  infoTitle: {
    color: '#1A1D21',
    fontSize: 15,
    fontWeight: '700',
  },

  infoText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF1',
  },

  urlText: {
    flex: 1,
    color: '#6B7280',
    fontSize: 11.5,
  },

  urlEditLink: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
  },

  openBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },

  openBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 18, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1D21',
  },

  modalHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 17,
  },

  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1A1D21',
  },

  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },

  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },

  modalBtnGhost: {
    backgroundColor: '#F4F5F7',
  },

  modalBtnGhostText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 12.5,
  },

  modalBtnPrimary: {
    backgroundColor: '#2563EB',
  },

  modalBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
});
