import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

const VIDEO_URL = 'http://100.107.155.126:8000/';

const videoHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
  />

  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #020617;
      overflow: hidden;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      background: #020617;
    }
  </style>
</head>

<body>
  <img src="${VIDEO_URL}" />
</body>
</html>
`;

export default function LiveVideoScreen() {
  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>
            Live Video
          </Text>

          <Text style={styles.subtitle}>
            CCTV Monitoring
          </Text>
        </View>

      </View>

      {/* VIDEO AREA */}
      <View style={styles.videoContainer}>

        <View style={styles.videoCard}>

          {/* LIVE INDICATOR */}
          <View style={styles.liveBadge}>

            <View style={styles.liveDot} />

            <Text style={styles.liveText}>
              LIVE
            </Text>

          </View>

          {/* CCTV MJPEG STREAM */}
          <WebView
            source={{
              html: videoHTML,
              baseUrl: 'http://100.107.155.126:8000/',
            }}
            style={styles.video}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            bounces={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />

        </View>

        {/* INFO */}
        <View style={styles.infoCard}>

          <View style={styles.infoRow}>

            <Ionicons
              name="videocam"
              size={20}
              color="#2563EB"
            />

            <View style={styles.infoTextContainer}>

              <Text style={styles.infoTitle}>
                AI CCTV Monitoring
              </Text>

              <Text style={styles.infoText}>
                YOLO vehicle detection and bay occupancy monitoring
              </Text>

            </View>

          </View>

        </View>

      </View>

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
    backgroundColor: '#020617',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },

  video: {
    flex: 1,
    backgroundColor: '#020617',
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

});

