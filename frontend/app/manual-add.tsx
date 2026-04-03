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
        "INSERT INTO schedule (name, amount, time, note) VALUES (?, ?, ?, ?)",
        [name, parseInt(amount) || 0, time, note],
      );
      return true;
    } catch (error) {
      console.error("Insert failed:", error);
      alert("Database Error: Could not save.");
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
