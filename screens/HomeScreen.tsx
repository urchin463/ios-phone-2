import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  useColorScheme,
  Platform,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  initDatabase,
  saveReceiver,
  searchReceivers,
  getRecentReceivers,
  Receiver,
} from "../db";

const TRANSFER_PATTERN =
  /.*?(\d+)\sRWF.*?transferred.*?to\s(.*?)\((\d+)\).*?at\s([\d\-\s:]+).*?Fee\swas:\s(.*?)\sRWF.*?\sNew\sbalance:\s(.*?)\sRWF/;
const PAYMENT_MERCHANT_PATTERN =
  /TxId: (\d+). Your payment of (.*?) RWF to (.*?) has been completed at ([\d\-\s:]+). Your new balance: (.*?) RWF. Fee was (\d+) RWF.?/;
const OLD_PAYMENT_MERCHANT_PATTERN =
  /.*?A transaction of (\d+) RWF by (.*?) on your MOMO.*?completed at ([\d\-\s:]+).*?Your new balance:(.*?) RWF. Fee was (\d+) RWF/;
const BUSS_CODE = /^\d{5,6}$/; // Business codes are 5-6 digits
const PHONE_NUMBER = /^07[2389]\d{7}$/; // MTN Rwanda phone numbers
const PHONE_NUMBER_2 = /^2507[2389]\d{7}$/; // MTN Rwanda phone numbers

const formatPhoneNumber = (number: string) => {
  if (number.startsWith("250")) {
    return number.slice(2);
  }
  return number;
};

const RESPONSES = {
  IND_2:
    "Wohereje $amount RWF kuri $number. Usigaranye 38,533 RWF. Murakoze gukoresha MTN Mobile Money.",
  BUSS: "Y'ello. Wishyuye  $amount RWF kuri $name, $number. ikiguzi 0 RWF. Transaction ID 14247881483. Konti yawe ya mobile money usigaranye no 38,433 RWF",
};

function replaceInString(str: string, obj: { [key: string]: string }) {
  let result = String(str);
  for (let key in obj) {
    result = result.replace(new RegExp(`\\$${key}`, "g"), obj[key]);
  }
  return result;
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [receiverName, setReceiverName] = useState("");
  const [receiverNumber, setReceiverNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Receiver[]>([]);
  const [recentReceivers, setRecentReceivers] = useState<Receiver[]>([]);
  const [showReceivers, setShowReceivers] = useState(false);

  useEffect(() => {
    initDatabase().then(() => {
      loadRecentReceivers();
    });
  }, []);

  const loadRecentReceivers = async () => {
    try {
      const receivers = await getRecentReceivers();
      setRecentReceivers(receivers);
    } catch (error) {
      console.error("Failed to load recent receivers:", error);
    }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length >= 2) {
      try {
        const results = await searchReceivers(text);
        setSearchResults(results);
        setShowReceivers(true);
      } catch (error) {
        console.error("Search failed:", error);
      }
    } else {
      setSearchResults([]);
      setShowReceivers(false);
    }
  };

  const selectReceiver = (receiver: Receiver) => {
    setReceiverName(receiver.name);
    setReceiverNumber(receiver.number);
    setShowReceivers(false);
    setSearchQuery("");
  };

  const handlePay = async () => {
    if (!receiverName || !amount) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    const isBussCode = BUSS_CODE.test(receiverNumber);
    const isPhoneNumber = PHONE_NUMBER.test(receiverNumber);
    const isPhoneNumber2 = PHONE_NUMBER_2.test(receiverNumber);

    if (receiverNumber && !isBussCode && !isPhoneNumber && !isPhoneNumber2) {
      Alert.alert("Error", "Invalid number/code format");
      return;
    }

    // Save receiver to database
    try {
      await saveReceiver({
        name: receiverName,
        number: receiverNumber,
      });
      loadRecentReceivers(); // Refresh recent receivers
    } catch (error) {
      console.error("Failed to save receiver:", error);
    }

    const response = replaceInString(
      isPhoneNumber || isPhoneNumber2 ? RESPONSES.IND_2 : RESPONSES.BUSS,
      {
        amount: Number(amount).toLocaleString(),
        name: receiverName,
        number: isPhoneNumber2 ? receiverNumber.slice(2) : receiverNumber,
      }
    );

    setModalContent(response);
    setModalVisible(true);
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;

    // Try to match with any of the patterns
    const transferMatch = text.match(TRANSFER_PATTERN);
    const merchantMatch = text.match(PAYMENT_MERCHANT_PATTERN);
    const oldMerchantMatch = text.match(OLD_PAYMENT_MERCHANT_PATTERN);

    if (transferMatch) {
      setAmount(transferMatch[1]);
      setReceiverName(transferMatch[2]);
      setReceiverNumber(transferMatch[3]);
    } else if (merchantMatch) {
      // when it is merchant, the receiver number is empty, and the receiver name is in this format "Merchant Name <Merchant Code>"
      console.log(merchantMatch);
      setAmount(merchantMatch[2].replace(/,/g, ""));
      setReceiverName(merchantMatch[3].split(" ").slice(0, -1).join(" "));
      setReceiverNumber(merchantMatch[3].split(" ").slice(-1).join(""));
    } else if (oldMerchantMatch) {
      setAmount(oldMerchantMatch[1]);
      setReceiverName(oldMerchantMatch[2]);
      setReceiverNumber("");
    }
  };

  const handleNumberChange = (text: string) => {
    // Remove any non-numeric characters
    const numericOnly = text.replace(/\D/g, "");

    // If number is longer than 10 digits and starts with "25", remove the prefix
    if (numericOnly.length > 10 && numericOnly.startsWith("25")) {
      setReceiverNumber(numericOnly.slice(2));
    } else {
      setReceiverNumber(numericOnly);
    }
  };

  const renderModal = () => {
    if (Platform.OS === "ios") {
      return (
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.iosModalContainer}>
            <SafeAreaView style={styles.iosModalContent}>
              {/* <View style={styles.iosModalHeader}>
                <Text style={styles.iosModalTitle}>MTN Mobile Money</Text>
                <TouchableOpacity 
                  style={styles.iosCloseButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.iosCloseButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View> */}
              <View style={styles.iosModalBody}>
                <Text style={styles.iosModalText}>{modalContent}</Text>
              </View>
              <TouchableOpacity
                style={styles.iosModalButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.iosModalButtonText}>DISMISS</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </Modal>
      );
    }

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View
            style={[
              styles.modalContent,
              { width: screenWidth >= 400 ? "70%" : "90%" },
            ]}
          >
            <Text style={styles.modalText}>{modalContent}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalButton}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderReceiver = ({ item }: { item: Receiver }) => (
    <TouchableOpacity
      style={[styles.receiverItem, isDark && styles.receiverItemDark]}
      onPress={() => selectReceiver(item)}
    >
      <Text style={[styles.receiverName, isDark && styles.receiverNameDark]}>
        {item.name}
      </Text>
      <Text
        style={[styles.receiverNumber, isDark && styles.receiverNumberDark]}
      >
        {item.number}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View
          style={[
            styles.container,
            isDark && styles.containerDark,
            { paddingTop: insets.top },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.titleDark]}>
              MTN MoMo
            </Text>
            <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
              Quick Transfer
            </Text>
          </View>

          <ScrollView
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.form}>
              <View style={styles.searchContainer}>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Search receivers..."
                  placeholderTextColor={isDark ? "#94A3B8" : "#64748B"}
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
              </View>

              {showReceivers && (
                <View style={styles.receiversList}>
                  <FlatList
                    data={searchQuery ? searchResults : recentReceivers}
                    renderItem={renderReceiver}
                    keyExtractor={(item) => `${item.id}-${item.number}`}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={
                      <Text
                        style={[styles.listHeader, isDark && styles.listHeaderDark]}
                      >
                        {searchQuery ? "Search Results" : "Recent Receivers"}
                      </Text>
                    }
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  Receiver Name
                </Text>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Enter receiver's name"
                  placeholderTextColor={isDark ? "#94A3B8" : "#64748B"}
                  value={receiverName}
                  onChangeText={setReceiverName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  Number/Code
                </Text>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Phone number or merchant code"
                  placeholderTextColor={isDark ? "#94A3B8" : "#64748B"}
                  value={receiverNumber}
                  onChangeText={handleNumberChange}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  Amount (RWF)
                </Text>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Enter amount"
                  placeholderTextColor={isDark ? "#94A3B8" : "#64748B"}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.pasteButton]}
                  onPress={handlePaste}
                >
                  <Text style={styles.buttonText}>Paste from Clipboard</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.payButton]}
                  onPress={handlePay}
                >
                  <Text style={styles.buttonText}>Pay</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {renderModal()}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 24,
  },
  containerDark: {
    backgroundColor: "#0F172A",
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FF6B00",
    marginBottom: 8,
  },
  titleDark: {
    color: "#FF8533",
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    opacity: 0.9,
  },
  subtitleDark: {
    color: "#94A3B8",
  },
  form: {
    flex: 1,
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginLeft: 4,
  },
  labelDark: {
    color: "#94A3B8",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1E293B",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  inputDark: {
    borderColor: "#1E293B",
    backgroundColor: "#1E293B",
    color: "#E2E8F0",
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pasteButton: {
    backgroundColor: "#475569",
  },
  payButton: {
    backgroundColor: "#FF6B00",
    padding: 18,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // iOS Modal Styles
  iosModalContainer: {
    flex: 1,
    backgroundColor: "#595959",
  },
  iosModalContent: {
    flex: 1,
    backgroundColor: "#595959",
  },
  iosModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  iosModalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
  },
  iosCloseButton: {
    padding: 8,
  },
  iosCloseButtonText: {
    fontSize: 17,
    color: "#FF3B30", // iOS system red
    fontWeight: "400",
  },
  iosModalBody: {
    flex: 1,
    padding: 20,
    backgroundColor: "#595959",
    justifyContent: "center",
    alignItems: "center",
  },
  iosModalText: {
    fontSize: 17,
    color: "#ffffff",
    marginBottom: 20,
    textAlign: "center",
  },
  iosModalButton: {
    backgroundColor: "#FFFFFF", // iOS system blue
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: "auto",
    marginBottom: 20,
    marginHorizontal: 20,
  },
  iosModalButtonText: {
    color: "#000000",
    fontSize: 17,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  // Existing modal styles for Android
  modalContainer: {
    flex: 1,
    backgroundColor: "#000000b3",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#262626",
    padding: 20,
    borderRadius: 10,
    margin: 20,
    alignSelf: "center",
  },
  modalText: {
    color: "#e5e7eb",
    fontSize: 16,
  },
  modalButton: {
    color: "white",
    textAlign: "center",
    padding: 10,
    marginTop: 10,
    fontSize: 16,
  },
  searchContainer: {
    marginBottom: 16,
  },
  receiversList: {
    maxHeight: 200,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  receiverItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  receiverItemDark: {
    backgroundColor: "#1E293B",
    borderBottomColor: "#334155",
  },
  receiverName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },
  receiverNameDark: {
    color: "#E2E8F0",
  },
  receiverNumber: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
  },
  receiverNumberDark: {
    color: "#94A3B8",
  },
  listHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    padding: 12,
    backgroundColor: "#F1F5F9",
  },
  listHeaderDark: {
    backgroundColor: "#0F172A",
    color: "#94A3B8",
  },
  scrollView: {
    flex: 1,
  },
  buttonContainer: {
    gap: 16,
    marginTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
});