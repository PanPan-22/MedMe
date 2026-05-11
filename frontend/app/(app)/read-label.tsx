import { BackHeader } from "@/components/back-header";
import { useToast } from "@/context/toast-context";
import { useBrandColor } from "@/hooks/use-brand-color";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GoogleGenAI } from "@google/genai";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SheetManager } from "react-native-actions-sheet";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const medicineSchema = z
  .object({
    is_medicine_label: z
      .boolean()
      .describe(
        "True only if the source text is from a medicine/medication label. False for any other content (receipts, random text, food labels, blank/unreadable, etc.). When false, the other fields may be empty.",
      ),
    medicine_name: z.string().describe("Name of the medicine"),
    count: z.number().describe("Number of units to take per dose"),
    type: z
      .enum(["Pills", "Capsule", "Injection", "Other"])
      .describe(
        "Medication form. Must be exactly one of: Pills (tablets), Capsule, Injection, or Other. Use 'Pills' when unsure.",
      ),
    whenToTake: z
      .string()
      .describe(
        "Comma-separated times to take the medicine in HH:MM 24-hour format (e.g., '08:00,14:00')",
      ),
    additional: z
      .string()
      .describe("Additional information about the medicine"),
  })
  .describe("Schema for a medicine note");

const LANGUAGE_NAMES: Record<string, string> = { en: "English", th: "Thai" };

// Try the preview model first; fall back to GA models on quota exhaustion.
// Non-quota errors (bad prompt, malformed image, network) fail fast — no
// point burning through every model when the input itself is the problem.
const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash"];

const isQuotaError = (e: any): boolean => {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  const status = e?.status ?? e?.code;
  if (status === 429 || status === 503) return true;
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("overloaded")
  );
};

const TalkToGenAI = async (prompt: string): Promise<string> => {
  const keys = [
    process.env.EXPO_PUBLIC_GEMINI_KEY,
    process.env.EXPO_PUBLIC_GEMINI_KEY_FALLBACK,
  ].filter((k): k is string => !!k);
  if (keys.length === 0) {
    console.warn("No Gemini API keys configured");
    return "ERROR_FAILED_ALL_KEYS";
  }

  for (const model of MODELS) {
    for (let i = 0; i < keys.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: keys[i] });
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(medicineSchema),
          },
        });
        const text = response.text;
        if (text) return text;
      } catch (error) {
        console.error(`${model} key ${i + 1} failed:`, error);
        if (!isQuotaError(error)) {
          // Bad input or other non-quota failure — don't keep trying.
          return "ERROR_FAILED_ALL_KEYS";
        }
        // Quota error: continue to next key, then next model.
      }
    }
  }
  return "ERROR_FAILED_ALL_KEYS";
};

const scanWithGoogleVision = async (uri: string) => {
  const GoogleAPI = process.env.EXPO_PUBLIC_GOOGLE_VISION_KEY;
  if (!GoogleAPI) {
    console.warn("EXPO_PUBLIC_GOOGLE_VISION_KEY is not set");
    return "Error scanning text from image. Please try again.";
  }
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
  }
};

export default function MedicineScreen() {
  const { t, i18n } = useTranslation();
  const { primary: brandColor } = useBrandColor();
  const { showToast } = useToast();
  const [image, setImage] = useState("");
  const [loading1, setLoading1] = useState(false); // Scanning
  const [loading2, setLoading2] = useState(false); // Parsing

  const handleCompleteScan = async () => {
    if (!image) return;

    setLoading1(true);
    try {
      const text = await scanWithGoogleVision(image);
      if (!text || text === "No text found") {
        showToast(t("could_not_read_text"), "error");
        setLoading1(false);
        return;
      }

      setLoading2(true);
      const lang = LANGUAGE_NAMES[i18n.resolvedLanguage ?? "en"] ?? "English";
      const aiResponse = await TalkToGenAI(
        `Determine whether the text below is from a medicine/medication label. Set is_medicine_label accordingly. If false, leave the other fields empty or zero. If true, extract medication info as JSON. Write the medicine_name and additional fields in ${lang} (translate if the source is in another language, but keep brand/trademark names in their original script). type, whenToTake, and count stay structural.\n\nLabel text:\n${text}`,
      );

      // FIX: Check if the AI call actually succeeded
      if (aiResponse === "ERROR_FAILED_ALL_KEYS") {
        showToast(t("ai_unavailable"), "error");
        return;
      }

      const parsedNote = JSON.parse(aiResponse);

      if (!parsedNote.is_medicine_label) {
        showToast(t("not_a_medicine_label"), "error");
        return;
      }

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
      showToast(t("something_went_wrong"), "error");
    } finally {
      setLoading1(false);
      setLoading2(false);
    }
  };

  const handleImagePickerSheet = async () => {
    const result = (await SheetManager.show("image-picker-sheet", {
      payload: { noCrop: true },
    })) as { uri: string } | undefined;
    if (result?.uri) setImage(result.uri);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("read_label") }} />
      <BackHeader title={t("read_label")} />
      <ScrollView className="px-4">
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medicine_image")}</Text>
        <Pressable
          onPress={handleImagePickerSheet}
          className="active:opacity-70 border-2 border-dashed border-primary rounded-2xl overflow-hidden bg-card items-center justify-center"
          style={{ aspectRatio: 1 }}
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
            disabled={loading1 || loading2}
            onPress={handleCompleteScan}
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
    </View>
  );
}
