import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Button, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
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
        formData.append("base64Image",`data:image/jpeg;base64,${base64}`);
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
            {image !== null && (
                <View style={styles.bigContainer}>
                    <Image source={{ uri: image }} style={{ width: 250, height: 250 }} resizeMode='contain' />
                    <View style={styles.buttonContainer}>
                        <Button title="Scan!" onPress={async () => {
                            const text = await scanText(image);
                            setScannedText(text);
                        }} />
                    </View>
                </View>
            )}
            {scannedText !== null && (
                <ThemedText type='subtitle'>Scanned Text: {scannedText}</ThemedText>
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
    bigContainer:{
        alignContent: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        borderColor: '#808080',
        borderWidth: 1,
        padding: 10,
        borderRadius: 10,
        marginTop: 20,
    }
})

export default ImageInput;