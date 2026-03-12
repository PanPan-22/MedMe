import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Button, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import Tesseract from 'tesseract.js';
import { ThemedText } from './themed-text';

const API_KEY = "K88520222388957";
const scanText = async (uri: string) => {
    try {
        const uriResponse = await fetch(uri);
        const blob = await uriResponse.blob();
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            }
            reader.readAsDataURL(blob);
        })

        const formData = new FormData();
        formData.append("base64Image", `data:image/jpeg;base64,${base64}`);
        formData.append("language", "eng");

        const response = await fetch(`https://api.ocr.space/parse/image`, {
            method: 'POST',
            headers: { apikey: API_KEY },
            body: formData,
        });
        const data = await response.json();
        const text = data?.ParsedResults?.[0]?.ParsedText || 'No text found';
        return text;
    } catch (error) {
        console.error('scanText failed', error);
        return 'Error scanning text from image. Please try again.';
    }
}
const scanWithTesseract = async (uri: string) => {
    const result = await Tesseract.recognize(uri, 'eng');
    return result.data.text;
}

const scanWithGoogleVision = async (uri: string) => {
    const GoogleAPI = "AIzaSyDHUXQcozaiMQubk8DBcClSaI8jzFQNmGY";
    try {
        const uriResponse = await fetch(uri);
        const blob = await uriResponse.blob();
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            }
            reader.readAsDataURL(blob);
        })

        const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GoogleAPI}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64 },
                    features: [{ type: 'TEXT_DETECTION' }]
                }]
            })
        });
        const data = await visionResponse.json();
        const text = data?.responses?.[0]?.fullTextAnnotation?.text || 'No text found';
        return text;
    } catch (error) {
        console.error('scanWithGoogleVision failed', error);
        return 'Error scanning text from image. Please try again.';
    }
}


const ImageInput = () => {
    const [image, setImage] = useState('');
    const [scannedText, setScannedText] = useState('');

    const takePhoto = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            alert('Camera permission is required to take a photo');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 1,
            aspect: [4, 3],
        });
        console.log("Camera!")

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    }
    const handleImagePickerPress = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
        });
        console.log("Gallery!")
        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    }

    return (
        <View>
            <ThemedText type='title'>Disturbing the Peace:</ThemedText>
            <TouchableOpacity onPress={takePhoto}>
                <ThemedText type='subtitle'>Take Photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImagePickerPress}>
                <ThemedText type='subtitle'>Pick from Gallery</ThemedText>
            </TouchableOpacity>
            {image !== '' && (
                <View style={styles.bigContainer}>
                    <Image source={{ uri: image }} style={{ width: 250, height: 250 }} resizeMode='contain' />
                    <View style={styles.buttonContainer}>
                        <Button title="Scan!" onPress={async () => {
                            const text = await scanText(image);
                            setScannedText(text);
                        }} />
                    </View>
                    <View style={styles.buttonContainer}>
                        <Button title="Scan with Tesseract!" onPress={async () => {
                            const text = await scanWithTesseract(image);
                            setScannedText(text);
                        }} />
                    </View>
                    <View style={styles.buttonContainer}>
                        <Button title="Scan with Google Vision!" onPress={async () => {
                            const text = await scanWithGoogleVision(image);
                            setScannedText(text);
                        }} />
                    </View>

                </View>
            )}
            {scannedText.length > 0 && (
                <View><ThemedText type='title'>Scanned Text:</ThemedText>
                <View style={styles.scannedTextContainer}>
                <ThemedText type='subtitle'>{scannedText}</ThemedText>
            </View></View>
            )}
            {/* //     {image && <Button title="Scan!" onPress={async () => {
        //         const text = await scanText(image);
        //         setScannedText(text);
        //     }} />}
        //     {scannedText && (
        //         <ThemedText type='subtitle'>Scanned Text: {scannedText}</ThemedText>
        //     )} */}
        </View>
    )
}

const styles = StyleSheet.create({
    buttonContainer: {
        marginTop: 10,
    },
    bigContainer: {
        alignContent: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        borderColor: '#808080',
        borderWidth: 1,
        padding: 10,
        borderRadius: 10,
        marginTop: 20,
    },
    scannedTextContainer: {
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#808080',
        padding: 10,
    }
})

export default ImageInput;