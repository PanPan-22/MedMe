import { GoogleGenAI } from "@google/genai";
import * as ImagePicker from "expo-image-picker";
// import { useSQLiteContext } from 'expo-sqlite';
import Ionicons from "@expo/vector-icons/Ionicons";
import * as SQLite from "expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Button, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SheetManager } from "react-native-actions-sheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Medication, saveToDB } from "./local-db";

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

const API_KEY = "K88520222388957";
const Gemini_key = "AIzaSyCaANmyo-BkSvg_HUZakeQmaoUkVQYRDdY";
const ai = new GoogleGenAI({ apiKey: Gemini_key });
const TalkToGenAI = async (prompt: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(medicineSchema),
      },
    });
    return response.text || "No response from AI";
  } catch (error) {
    console.error("TalkToGenAI failed", error);
    return "Error communicating with AI. Please try again.";
  }
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

const ImageInput = () => {
  const [image, setImage] = useState("");
  const [scannedText, setScannedText] = useState("");
  const [loading1, setLoading1] = useState(false); // Scanning
  const [loading2, setLoading2] = useState(false); // Parsing
  const [aiRes, setAIRes] = useState("");
  const [note, setNote] = useState<Medication | null>(null);
  const [success, setSuccess] = useState(false);

  const db = useSQLiteContext();

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alert("Camera permission is required to take a photo");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      aspect: [4, 3],
    });
    console.log("Camera!");

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };
  const handleImagePickerPress = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    console.log("Gallery!");
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleScan = async (method: ScanMethod) => {
    setLoading1(true);
    console.log(`Starting scan with ${ScanMethod[method]}...`);
    try {
      let text = "";
      switch (method) {
        case ScanMethod.GoogleVision:
          text = await scanWithGoogleVision(image);
          break;
      }
      setScannedText(text);
    } catch (error) {
      console.error(`Error scanning with ${ScanMethod[method]}:`, error);
    } finally {
      setLoading1(false);
    }
  };

  const handleParseJSON = async () => {
    setLoading2(true);
    try {
      const res = await TalkToGenAI(
        "Turn this text into JSON format: " + scannedText,
      );
      console.log("AI Response:", res);
      const note = JSON.parse(res);
      setAIRes(res);
      setNote(note);
    } catch (err) {
      console.error("Error in TalkToGenAI:", err);
      setAIRes("Error communicating with AI. Please try again.");
    } finally {
      setLoading2(false);
    }
  };

  const handleImagePickerSheet = () => {
    console.log("Opening image picker sheet...");
    SheetManager.show("image-picker-sheet");
  };

  return (
    <SafeAreaView>
      {/* <Button title="Save to DB" onPress={handleSave} /> */}
      <Pressable onPress={takePhoto}>
        <Text>Take Photo</Text>
      </Pressable>
      <Pressable onPress={handleImagePickerPress}>
        <Text>Pick from Gallery</Text>
      </Pressable>
      <Pressable onPress={handleImagePickerSheet}>
        <View className="border border-gray-300 p-2 w-full items-center rounded-lg h-[25rem]">
          {image === "" ? (
            <View className="flex-column items-center justify-center gap-4">
              <Ionicons name="add-circle-outline" size={32} color={"black"} />
              <Text className="text-gray-500">No image selected</Text>
            </View>
          ) : (
            <Image
              source={{ uri: image }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          )}
        </View>
      </Pressable>
      {image !== "" && (
        <View style={styles.bigContainer}>
          <Image
            source={{ uri: image }}
            style={{ width: 250, height: 250 }}
            resizeMode="contain"
          />
          <View style={styles.buttonContainer}>
            <Button
              title="Scan with Google Vision!"
              disabled={loadingScan}
              onPress={async () => {
                console.log("Scanning with Google Vision...");
                handleScan(ScanMethod.GoogleVision);
              }}
            />
          </View>
        </View>
      )}
      {loading1 && (
        <View style={{ justifyContent: "center", alignItems: "center" }}>
          <Text className="text-2xl font-bold text-primary text-center mt-4">
            Scanning...
          </Text>
          <Image
            source={{ uri: "https://giffiles.alphacoders.com/763/76339.gif" }}
            resizeMode="contain"
            style={{ width: 300, height: 200 }}
          />
        </View>
      )}
      {scannedText.length > 0 && (
        <View>
          <Text>Scanned Text:</Text>
          <View style={styles.scannedTextContainer}>
            <Text>{scannedText}</Text>
          </View>
          <View
            style={[
              styles.buttonContainer,
              { flexDirection: "row", justifyContent: "space-between" },
            ]}
          >
            <Button
              title="Parse to JSON"
              disabled={loading2}
              onPress={async () => {
                console.log("Parsing text to JSON with AI...");
                await handleParseJSON();
              }}
            />
            <Button
              title="Clear"
              onPress={() => {
                setImage("");
                setScannedText("");
                setAIRes("");
                setNote({
                  id: 0,
                  medicine_name: "",
                  count: 0,
                  type: "",
                  whenToTake: "",
                  additional: "",
                });
              }}
            />
          </View>
          {loading2 && (
            <View style={{ justifyContent: "center", alignItems: "center" }}>
              <Text className="text-2xl font-bold text-primary text-center mt-4">
                Parsing text with AI...
              </Text>
              <Image
                source={{
                  uri: "https://giffiles.alphacoders.com/763/76335.gif",
                }}
                resizeMode="contain"
                style={{ width: 200, height: 200 }}
              />
            </View>
          )}
          {aiRes.length > 0 && (
            <View style={styles.scannedTextContainer}>
              <Text>
                Medicine Name: {note?.medicine_name}
                {"\n"}
                Count: {note?.count}
                {"\n"}
                Type: {note?.type}
                {"\n"}
                When to Take: {note?.whenToTake}
                {"\n"}
                Additional: {note?.additional}
              </Text>
              <View style={[styles.buttonContainer, { marginTop: 20 }]}>
                <Button
                  title="Save to DB"
                  onPress={async () => {
                    if (note) {
                      const result = await saveToDB(db, note);
                      setSuccess(result);
                    }
                  }}
                />
              </View>
              {success && (
                <View>
                  <Text>It's done.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    marginTop: 10,
  },
  bigContainer: {
    alignContent: "center",
    justifyContent: "center",
    alignSelf: "center",
    borderColor: "#808080",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    margin: 10,
  },
  scannedTextContainer: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#808080",
    padding: 10,
  },
});

export default ImageInput;
