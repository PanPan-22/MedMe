import { useBrandColor } from "@/hooks/use-brand-color";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GoogleGenAI } from "@google/genai";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
// import { useSQLiteContext } from 'expo-sqlite';
import * as SQLite from "expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Image } from "react-native";
import { SheetManager } from "react-native-actions-sheet";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;
let loadingScan = false;

enum ScanMethod {
  GoogleVision,
}

const medicineSchema = z
  .object({
    medicine_name: z.string().describe("Name of the medicine"),
    count: z.number().describe("Number of pills"),
    type: z.string().describe("Type of the medicine"),
    whenToTake: z
      .string()
      .describe(
        "Array of times to take the medicine in HH:MM format (e.g., 08:00, 14:00)",
      ),
    additional: z
      .string()
      .describe("Additional information about the medicine"),
  })
  .describe("Schema for a medicine note");

const jsonSchema = zodToJsonSchema(medicineSchema, "medicineSchema");

const Gemini_key = "AIzaSyCaANmyo-BkSvg_HUZakeQmaoUkVQYRDdY";
const Fallback_key = "AIzaSyAau1ocYY2EHhe_RqDleLf7QQx8TLgO4pA";

const TalkToGenAI = async (prompt: string): Promise<string> => {
  const keys = [Gemini_key, Fallback_key];

  for (let i = 0; i < keys.length; i++) {
    try {
      console.log(`Trying key ${i + 1}...`);
      // Use the key from the loop, not the hardcoded one!
      const ai = new GoogleGenAI({ apiKey: keys[i] });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(medicineSchema),
        },
      });

      const text = response.text;
      if (text) return text;
    } catch (error) {
      console.error(`Key ${i + 1} failed:`, error);
      if (i === keys.length - 1) {
        // Only return an error string if ALL keys fail
        return "ERROR_FAILED_ALL_KEYS";
      }
    }
  }
  return "ERROR_FAILED_ALL_KEYS";
};

const scanWithGoogleVision = async (uri: string) => {
  const GoogleAPI = "AIzaSyDHUXQcozaiMQubk8DBcClSaI8jzFQNmGY";
  loadingScan = true;
  try {
    const uriResponse = await fetch(uri);
    const blob = await uriResponse.blob();
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.readAsDataURL(blob);
    });

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GoogleAPI}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      },
    );
    const data = await visionResponse.json();
    const text =
      data?.responses?.[0]?.fullTextAnnotation?.text || "No text found";
    return text;
  } catch (error) {
    console.error("scanWithGoogleVision failed", error);
    return "Error scanning text from image. Please try again.";
  } finally {
    console.log("Scan complete");
    loadingScan = false;
  }
};

export default function MedicineScreen() {
  const { t } = useTranslation();
  const { primary: brandColor } = useBrandColor();
  const [image, setImage] = useState("");
  const [scannedText, setScannedText] = useState("");
  const [loading1, setLoading1] = useState(false); // Scanning
  const [loading2, setLoading2] = useState(false); // Parsing
  const [success, setSuccess] = useState(false);

  const db = useSQLiteContext();

  const handleCompleteScan = async () => {
    if (!image) return;

    setLoading1(true);
    try {
      const text = await scanWithGoogleVision(image);
      if (!text || text === "No text found") {
        alert(t("could_not_read_text"));
        setLoading1(false);
        return;
      }

      setLoading2(true);
      const aiResponse = await TalkToGenAI("Turn this text into JSON: " + text);

      // FIX: Check if the AI call actually succeeded
      if (aiResponse === "ERROR_FAILED_ALL_KEYS") {
        alert(t("ai_unavailable"));
        return;
      }

      const parsedNote = JSON.parse(aiResponse);

      router.push({
        pathname: "/confirm-medication",
        params: {
          medicine_name: parsedNote.medicine_name,
          count: String(parsedNote.count), // Cast to string for params
          type: parsedNote.type,
          whenToTake: parsedNote.whenToTake,
          additional: parsedNote.additional,
        },
      });
    } catch (error) {
      console.error("Combined scan failed:", error);
      alert(t("something_went_wrong"));
    } finally {
      setLoading1(false);
      setLoading2(false);
    }
  };

  const handleImagePickerSheet = async () => {
    console.log("Opening image picker sheet...");
    // 1. Tell TS exactly what the sheet returns (an object with a uri string)
    const result = (await SheetManager.show("image-picker-sheet")) as
      | { uri: string }
      | undefined;

    // 2. Safely check if result exists, then extract the uri
    if (result && result.uri) {
      console.log("Image URI extracted:", result.uri);
      setImage(result.uri); // This updates your state with just the string
    }
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: t("read_label") }} />
      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={brandColor} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{t("read_label")}</Text>
      </View>
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medicine_image")}</Text>
        <Pressable
          onPress={handleImagePickerSheet}
          className="border-2 border-dashed border-primary rounded-2xl overflow-hidden bg-card items-center justify-center"
          style={{ aspectRatio: 4 / 3 }}
        >
          {image === "" ? (
            <View className="items-center gap-2">
              <Ionicons name="camera-outline" size={40} color={brandColor} />
              <Text className="text-primary text-sm">{t("tap_to_add_photo")}</Text>
            </View>
          ) : (
            <Image
              source={{ uri: image }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          )}
        </Pressable>
        {image !== "" && (
          <Pressable onPress={() => setImage("")} className="active:opacity-70 self-end bg-red-500 px-4 py-2 rounded-xl">
            <Text className="text-white font-semibold text-sm">{t("clear")}</Text>
          </Pressable>
        )}
      </View>
      {image !== "" && (
        <>
          <Pressable
            className="disabled:opacity-50 active:opacity-50 flex-row items-center justify-center gap-4 bg-primary rounded-xl p-4 w-full"
            disabled={loading1 || loading2} // Disable button if either loading state is true
            onPress={async () => {
              console.log("Starting combined scan and parse...");
              handleCompleteScan();
            }}
          >
            <Text className="text-2xl text-background">
              {loading1
                ? t("scanning")
                : loading2
                  ? t("parsing")
                  : t("scan_image")}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
