import { GoogleGenAI } from "@google/genai";
import * as ImagePicker from "expo-image-picker";
// import { useSQLiteContext } from 'expo-sqlite';
import * as SQLite from "expo-sqlite";
import { useState } from "react";
import {
  Button,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Tesseract from "tesseract.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Medication, saveToDB as SteelBallRun } from "./local_db";

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;

const medicineSchema = z
  .object({
    medicine_name: z.string().describe("Name of the medicine"),
    count: z.number().describe("Number of pills"),
    type: z.string().describe("Type of the medicine"),
    whenToTake: z
      .string()
      .describe(
        "When to take the medicine in HH:MM format (e.g., 08:00, 14:00)",
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
const scanText = async (uri: string) => {
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

    const formData = new FormData();
    formData.append("base64Image", `data:image/jpeg;base64,${base64}`);
    formData.append("language", "eng");

    const response = await fetch(`https://api.ocr.space/parse/image`, {
      method: "POST",
      headers: { apikey: API_KEY },
      body: formData,
    });
    const data = await response.json();
    const text = data?.ParsedResults?.[0]?.ParsedText || "No text found";
    return text;
  } catch (error) {
    console.error("scanText failed", error);
    return "Error scanning text from image. Please try again.";
  }
};
const scanWithTesseract = async (uri: string) => {
  const result = await Tesseract.recognize(uri, "eng");
  return result.data.text;
};

const scanWithGoogleVision = async (uri: string) => {
  const GoogleAPI = "AIzaSyDHUXQcozaiMQubk8DBcClSaI8jzFQNmGY";
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

const ImageInput = () => {
  const [image, setImage] = useState("");
  const [scannedText, setScannedText] = useState("");
  const [loading1, setLoading1] = useState(false); // Scanning
  const [loading2, setLoading2] = useState(false); // Parsing
  const [aiRes, setAIRes] = useState("");
  const [note, setNote] = useState<Medication | null>(null);

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

  const handleParseJSON = async () => {
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
    }
  };

  return (
    <SafeAreaView>
      {/* <Button title="Save to DB" onPress={handleSave} /> */}
      <Text>Scan now:</Text>
      <TouchableOpacity onPress={takePhoto}>
        <Text>Take Photo</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleImagePickerPress}>
        <Text>Pick from Gallery</Text>
      </TouchableOpacity>
      {image !== "" && (
        <View style={styles.bigContainer}>
          <Image
            source={{ uri: image }}
            style={{ width: 250, height: 250 }}
            resizeMode="contain"
          />
          <View style={styles.buttonContainer}>
            <Button
              title="Scan!"
              onPress={async () => {
                const text = await scanText(image);
                setScannedText(text);
              }}
            />
          </View>
          <View style={styles.buttonContainer}>
                        <Button title="Scan with Tesseract!" onPress={async () => {
                            console.log("Scanning with Tesseract...");
                            const text = await scanWithTesseract(image);
                            setScannedText(text);
                        }} />
                    </View>
          <View style={styles.buttonContainer}>
            <Button
              title="Scan with Google Vision!"
              onPress={async () => {
                console.log("Scanning with Google Vision...");
                const text = await scanWithGoogleVision(image);
                setScannedText(text);
              }}
            />
          </View>
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
              { flexDirection: "row", justifyContent: "space-between"},
            ]}
          >
            <Button
              title="Parse to JSON"
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
                  medicine_name: "",
                  count: 0,
                  type: "",
                  whenToTake: "",
                  additional: "",
                });
              }}
            />
          </View>
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
              <View style={[styles.buttonContainer, { marginTop: 20}]}>
                <Button
                  title="Save to DB"
                  onPress={() => note && SteelBallRun(note)}
                />
              </View>
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
    marginTop: 20,
  },
  scannedTextContainer: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#808080",
    padding: 10,
  },
});

export default ImageInput;
