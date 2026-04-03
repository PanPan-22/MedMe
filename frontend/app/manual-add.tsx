import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function ManagementScreen() {
  const db = useSQLiteContext();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  const scheduleMedicationReminder = async (name: string, timeStr: string) => {
    // 1. Check Permissions
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.granted;

    if (!status) {
      const { status: newStatus } =
        await Notifications.requestPermissionsAsync();
      status = newStatus === "granted";
    }

    if (!status) {
      alert("Permission for notifications is required to send reminders.");
      return null;
    }

    // 2. Parse HH:MM
    const [hours, minutes] = timeStr.split(":").map(Number);

    // 3. Schedule the recurring daily notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Medication Time! 💊",
        body: `It is time to take your ${name}.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true, // This ensures it fires every day at this time
        channelId: "default", // Matches the channel in your _layout.tsx
      },
    });

    return notificationId; // We return this so we can save it to the DB
  };

  const addMed = async () => {
    // 1. Basic Empty Check
    if (!name.trim() || !amount.trim() || !time.trim()) {
      alert("Please fill in Name, Amount, and Time");
      return false;
    }

    // 2. 24hr HH:MM Format Check
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      alert("Invalid Time Format. Please use HH:MM (e.g., 08:30 or 21:45)");
      return false;
    }

    try {
      // 2. Insert into SQLite with the notification ID
      await db.runAsync(
        "INSERT INTO schedule (name, amount, time, note, notification_id) VALUES (?, ?, ?, ?, ?)",
        [name, parseInt(amount) || 0, time, note, notifId],
      );

      return true;
    } catch (error) {
      console.error("Failed to save and schedule:", error);
      return false;
    }
  };

  return (
    <ScrollView className="bg-background p-2">
      <Stack.Screen options={{ headerShown: true, title: "Manual Add" }} />
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Medication name</Text>
        <TextInput
          value={name}
          onChangeText={(newName) => setName(newName)}
          keyboardType="default"
          placeholder="Medication name"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
        />
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Amount</Text>
        <TextInput
          value={amount}
          onChangeText={(newAmount) => setAmount(newAmount)}
          keyboardType="numeric"
          placeholder="Amount"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
        />
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Time</Text>
        <TextInput
          value={time}
          onChangeText={(newTime) => setTime(newTime)}
          keyboardType="default"
          placeholder="Time"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
        />
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Additional Note</Text>
        <TextInput
          value={note}
          onChangeText={(newNote) => setNote(newNote)}
          multiline={true}
          keyboardType="default"
          placeholder="Additional Note"
          placeholderTextColor="#888888"
          textAlignVertical="top"
          className="text-primary align-text-top text-base h-40 bg-white border border-primary rounded-2xl px-3 web:pt-3"
        />
      </View>
      <View className="items-center mt-8">
        <Pressable
          className="items-center justify-center bg-primary rounded-xl p-4 w-60"
          onPress={async () => {
            const success = await addMed();
            if (success) {
              router.back();
            } else {
              console.error(
                "Failed to add medication. Please check the inputs and try again.",
              );
              // Stay on the screen and let the user fix the issue
            }
          }}
        >
          <Text className="text-2xl text-white">Submit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
