import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

const GCASH_BLUE = "#0072CE";
const SUCCESS_GREEN = "#00A651";
const FAILED_RED = "#E63946";
const TEXT_DARK = "#1A1A1A";
const TEXT_GRAY = "#8A8A8A";

// Ilang beses tayo mag-re-check sa DB bago tayo mag-give up at ituring na
// "hindi pa updated" - dahil yung PayMongo webhook (payment.paid) ay
// asynchronous at may latency, posibleng mauna dumating dito yung user
// bago pa ma-update ng webhook yung payment_status sa Supabase.
const MAX_POLL_ATTEMPTS = 6; // ~9 seconds total (1.5s interval)
// Kapag isinara lang ng user ang GCash tab (cancel/dismiss), wala tayong
// status galing sa redirect -- mas maikling hintay lang bago magdesisyon.
const MAX_POLL_ATTEMPTS_UNKNOWN = 3;
const POLL_INTERVAL_MS = 1500;

export default function PaymentReturnScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [bookingData, setBookingData] = useState<{ price?: number; shop_name?: string; payment_status?: string } | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const pollCountRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bookingId = Array.isArray(searchParams?.bookingId)
    ? searchParams.bookingId[0]
    : searchParams?.bookingId || "";

  const status = Array.isArray(searchParams?.status)
    ? searchParams.status[0]
    : searchParams?.status || "";

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    pollCountRef.current = 0;

    // Tinatanong ang PayMongo mismo (sa pamamagitan ng verify-gcash-payment
    // Edge Function) kung bayad na ba talaga. Ito ang sumasalo kapag hindi
    // dumating ang webhook -- ito ang dahilan kung bakit dating "Payment
    // Failed" ang lumalabas kahit tapos na ang bayad sa GCash.
    const verifyWithPayMongo = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-gcash-payment", {
          body: { bookingId },
        });
        if (error) {
          console.log("[PayMongo] verify error:", error.message);
          return null;
        }
        console.log("[PayMongo] verify result:", JSON.stringify(data));
        return data as { paymentStatus?: string; sourceStatus?: string; reason?: string } | null;
      } catch (err) {
        console.log("[PayMongo] verify threw:", err);
        return null;
      }
    };

    const fetchBookingDetails = async () => {
      try {
        const { data, error } = await supabase
          .from("home_service")
          .select("price, shop_name, payment_status")
          .eq("id", bookingId)
          .single();

        if (!isMounted) return;

        if (error) {
          // Karaniwan ay network na hindi pa bumabalik pagkagaling sa GCash
          // app -- mag-retry imbes na agad magpakita ng "Payment Failed".
          console.log("Supabase fetch error:", error.message);
          if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
            pollCountRef.current += 1;
            pollTimeoutRef.current = setTimeout(fetchBookingDetails, POLL_INTERVAL_MS);
            return;
          }
          setFailureReason("source_lookup_failed");
          setLoading(false);
          return;
        }

        if (data) {
          setBookingData(data);

          if (data.payment_status === "Paid" || status === "failed") {
            setLoading(false);
            return;
          }

          // Hindi pa "Paid" sa DB. Huwag agad magdeklara ng failed --
          // kumpirmahin muna sa PayMongo.
          const verdict = await verifyWithPayMongo();
          if (!isMounted) return;

          if (verdict?.paymentStatus === "Paid") {
            setBookingData({ ...data, payment_status: "Paid" });
            setFailureReason(null);
            setLoading(false);
            return;
          }
          if (verdict?.reason) setFailureReason(verdict.reason);

          // Sagot ng PayMongo ay "pending" pa rin (hindi pa tapos ang
          // authorize sa GCash, o papadating pa lang) -- mag-retry.
          const maxAttempts =
            status === "success" ? MAX_POLL_ATTEMPTS : MAX_POLL_ATTEMPTS_UNKNOWN;
          if (pollCountRef.current < maxAttempts) {
            pollCountRef.current += 1;
            pollTimeoutRef.current = setTimeout(fetchBookingDetails, POLL_INTERVAL_MS);
            return; // huwag munang i-stop yung loading state
          }
        }

        setLoading(false);
      } catch (err) {
        console.log("Failed to fetch booking details:", err);
        if (!isMounted) return;
        if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
          pollCountRef.current += 1;
          pollTimeoutRef.current = setTimeout(fetchBookingDetails, POLL_INTERVAL_MS);
          return;
        }
        setFailureReason("source_lookup_failed");
        setLoading(false);
      }
    };

    fetchBookingDetails();

    return () => {
      isMounted = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [bookingId, status, retryTick]);

  const handleCheckAgain = () => {
    setFailureReason(null);
    setLoading(true);
    setRetryTick((tick) => tick + 1);
  };

  // Malinaw na paliwanag base sa isinagot ng PayMongo, imbes na isang
  // pangkalahatang "payment failed" na walang matulungan sa customer.
  const failureMessage = (() => {
    switch (failureReason) {
      case "source_not_chargeable":
        return "Hindi pa namin natatanggap ang kumpirmasyon ng GCash para sa bayad na ito. Kung nabawasan na ang GCash mo, pindutin ang “Check Again” pagkalipas ng ilang sandali.";
      case "payment_creation_failed":
      case "payment_not_paid":
        return "Hindi naisagawa ng GCash ang bayad. Walang nasingil sa iyo -- puwede kang mag-Pay with GCash ulit mula sa bookings list.";
      case "payment_not_found":
        return "Naaprubahan ang GCash authorization pero hindi pa namin makita ang kaukulang bayad. Pindutin ang “Check Again” pagkalipas ng ilang sandali.";
      case "no_source":
        return "Hindi pa nasisimulan ang GCash payment para sa booking na ito. Puwede kang mag-Pay with GCash mula sa bookings list.";
      case "source_lookup_failed":
        return "Hindi namin maabot ang PayMongo ngayon. Nakabook pa rin ang service mo -- pakisubukan ulit mamaya.";
      default:
        return "Your payment was canceled or could not be completed. Please try again.";
    }
  })();

  const handleContinue = () => {
    router.replace("/customer/dashboard");
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={GCASH_BLUE} />
        <Text style={styles.loadingText}>Confirming your payment status...</Text>
      </View>
    );
  }

  // Gamitin ang payment_status ng booking (galing DB) bilang pangunahing
  // batayan; ang URL status param ay fallback lang.
  const isSuccess = bookingData?.payment_status
    ? bookingData.payment_status === "Paid"
    : status === "success";
  const accentColor = isSuccess ? SUCCESS_GREEN : FAILED_RED;
  const amount = bookingData?.price ?? 0;
  const payee = bookingData?.shop_name || "Your Booking Provider";
  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const refNo = `${Date.now().toString().slice(-13)}`;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerLogo}>GCash</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusBlock}>
          <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
            <Ionicons
              name={isSuccess ? "checkmark" : "close"}
              size={40}
              color="#ffffff"
            />
          </View>
          <Text style={[styles.statusLabel, { color: accentColor }]}>
            {isSuccess ? "Payment Successful" : "Payment Failed"}
          </Text>
          <Text style={styles.amountLabel}>You paid</Text>
          <Text style={styles.amountValue}>
            ₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </Text>
        </View>

        <View style={styles.receiptCard}>
          <View style={styles.notchLeft} />
          <View style={styles.notchRight} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Paid to</Text>
            <Text style={styles.receiptValue}>{payee}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Booking ID</Text>
            <Text style={styles.receiptValue}>{bookingId || "—"}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Reference No.</Text>
            <Text style={styles.receiptValue}>{refNo}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Date & Time</Text>
            <Text style={styles.receiptValue}>{dateTimeStr}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Payment Method</Text>
            <Text style={styles.receiptValue}>GCash</Text>
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabelBold}>Status</Text>
            <View style={[styles.statusPill, { backgroundColor: accentColor + "1A" }]}>
              <Text style={[styles.statusPillText, { color: accentColor }]}>
                {isSuccess ? "Completed" : "Cancelled"}
              </Text>
            </View>
          </View>
        </View>

        {!isSuccess && <Text style={styles.errorNote}>{failureMessage}</Text>}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="share-social-outline" size={20} color={GCASH_BLUE} />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="download-outline" size={20} color={GCASH_BLUE} />
            </View>
            <Text style={styles.actionLabel}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="help-circle-outline" size={20} color={GCASH_BLUE} />
            </View>
            <Text style={styles.actionLabel}>Help</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {!isSuccess && (
          <TouchableOpacity
            style={styles.checkAgainButton}
            onPress={handleCheckAgain}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={16} color={GCASH_BLUE} />
            <Text style={styles.checkAgainButtonText}>Check Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.doneButton}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F5F8" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#ffffff" },
  loadingText: { marginTop: 16, fontSize: 16, color: "#374151" },
  header: { backgroundColor: GCASH_BLUE, paddingTop: 54, paddingBottom: 16, alignItems: "center" },
  headerLogo: { color: "#ffffff", fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  scrollContent: { paddingBottom: 40, alignItems: "center" },
  statusBlock: { alignItems: "center", marginTop: 28, marginBottom: 20, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  statusLabel: { fontSize: 16, fontWeight: "700", marginBottom: 18 },
  amountLabel: { fontSize: 13, color: TEXT_GRAY, marginBottom: 4 },
  amountValue: { fontSize: 36, fontWeight: "800", color: TEXT_DARK },
  receiptCard: {
    width: "90%", backgroundColor: "#ffffff", borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20,
    elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8,
    position: "relative", overflow: "visible",
  },
  notchLeft: { position: "absolute", left: -10, top: "50%", width: 20, height: 20, borderRadius: 10, backgroundColor: "#F3F5F8" },
  notchRight: { position: "absolute", right: -10, top: "50%", width: 20, height: 20, borderRadius: 10, backgroundColor: "#F3F5F8" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  receiptLabel: { fontSize: 13, color: TEXT_GRAY },
  receiptLabelBold: { fontSize: 13, color: TEXT_DARK, fontWeight: "700" },
  receiptValue: { fontSize: 13, color: TEXT_DARK, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  dashedDivider: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: "#D9DCE1", marginVertical: 10 },
  statusPill: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  errorNote: { fontSize: 13, color: FAILED_RED, textAlign: "center", marginTop: 16, paddingHorizontal: 30, lineHeight: 20 },
  actionsRow: { flexDirection: "row", justifyContent: "center", marginTop: 28, gap: 36 },
  actionItem: { alignItems: "center" },
  actionIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E8F2FD", justifyContent: "center", alignItems: "center", marginBottom: 6 },
  actionLabel: { fontSize: 12, color: TEXT_GRAY },
  bottomBar: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 28, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#EEEEEE" },
  checkAgainButton: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
    paddingVertical: 14, borderRadius: 30, marginBottom: 10,
    borderWidth: 1.5, borderColor: GCASH_BLUE, backgroundColor: "#ffffff",
  },
  checkAgainButtonText: { color: GCASH_BLUE, fontSize: 15, fontWeight: "700" },
  doneButton: { backgroundColor: GCASH_BLUE, paddingVertical: 15, borderRadius: 30, alignItems: "center" },
  doneButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});